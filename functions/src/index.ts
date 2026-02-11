import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { google } from "googleapis";

initializeApp();

type WebhookEventType = "check_in" | "member_update" | "waiver_signed";

interface WebhookEvent {
  type: WebhookEventType;
  payload: Record<string, unknown>;
}

const db = getFirestore();
const adminAuth = getAuth();

type OutboundEventType =
  | "member.created_temp"
  | "member.updated"
  | "member.rank_changed"
  | "member.streak_milestone"
  | "attendance.checked_in"
  | "waiver.signed"
  | "subscription.started"
  | "subscription.stopped";

interface OutboundEventEnvelope {
  eventId: string;
  eventType: OutboundEventType;
  eventVersion: "1.0";
  occurredAt: string;
  source: "fight-club-app";
  memberId?: string;
  crmContactId?: string | null;
  hasCrmContactId?: boolean;
  payload: Record<string, unknown>;
}

const DELIVERY_BACKOFF_SECONDS = [60, 300, 900, 3600, 21600];
const MAX_DELIVERY_ATTEMPTS = DELIVERY_BACKOFF_SECONDS.length;

/**
 * Baseline health function for deploy verification.
 */
export const health = onRequest((req, res) => {
  res.status(200).json({
    ok: true,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

/**
 * Minimal boundary function for webhook event enqueueing.
 * Final retry + delivery worker logic will be added in implementation phase.
 */
export const enqueueWebhookEvent = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const body = req.body as Partial<WebhookEvent>;
  if (!body?.type || !body?.payload) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }

  const doc = await db.collection("webhookEvents").add({
    type: body.type,
    payload: body.payload,
    status: "pending",
    attempts: 0,
    nextAttempt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  logger.info("Webhook event enqueued", { id: doc.id, type: body.type });
  res.status(202).json({ accepted: true, id: doc.id });
});

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 500 ? `${message.slice(0, 497)}...` : message;
}

function toIsoDate(value: unknown): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date().toISOString();
}

async function enqueueOutboundEvent(
  eventType: OutboundEventType,
  payload: Record<string, unknown>,
  memberId?: string
) {
  const occurredAt = new Date().toISOString();
  const eventRef = db.collection("webhookEvents").doc();
  let crmContactId: string | null = null;

  if (memberId) {
    try {
      const memberSnapshot = await db.collection("members").doc(memberId).get();
      const memberData = memberSnapshot.data() as Record<string, unknown> | undefined;
      crmContactId = typeof memberData?.crmContactId === "string" ? memberData.crmContactId : null;
    } catch (error) {
      logger.warn("Failed to load crmContactId for outbound event", {
        memberId,
        eventType,
        error: truncateError(error)
      });
    }
  }

  const envelope: OutboundEventEnvelope = {
    eventId: eventRef.id,
    eventType,
    eventVersion: "1.0",
    occurredAt,
    source: "fight-club-app",
    memberId,
    crmContactId,
    hasCrmContactId: Boolean(crmContactId),
    payload
  };

  await eventRef.set({
    ...envelope,
    status: "pending",
    attempts: 0,
    nextAttempt: Timestamp.now(),
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now()
  });

  logger.info("Outbound webhook event enqueued", {
    eventId: eventRef.id,
    eventType,
    memberId
  });
}

function nextAttemptTimestamp(attemptNumber: number): Timestamp | null {
  if (attemptNumber >= MAX_DELIVERY_ATTEMPTS) {
    return null;
  }
  const backoffSeconds = DELIVERY_BACKOFF_SECONDS[attemptNumber - 1];
  const nextDate = new Date(Date.now() + backoffSeconds * 1000);
  return Timestamp.fromDate(nextDate);
}

/**
 * Scheduled worker that delivers pending outbound webhook events to CRM.
 */
export const deliverPendingWebhooks = onSchedule(
  {
    schedule: "every 1 minutes",
    region: "us-central1",
    timeZone: "Australia/Brisbane"
  },
  async () => {
    const webhookUrl = process.env.CRM_WEBHOOK_URL;
    if (!webhookUrl) {
      logger.warn("Webhook delivery skipped: missing CRM_WEBHOOK_URL");
      return;
    }

    const now = Timestamp.now();
    const pendingSnapshot = await db
      .collection("webhookEvents")
      .where("status", "==", "pending")
      .where("nextAttempt", "<=", now)
      .limit(25)
      .get();

    const legacyPendingSnapshot = await db
      .collection("webhookEvents")
      .where("status", "==", "pending")
      .limit(25)
      .get();

    const docsById = new Map<string, any>();
    for (const docSnap of pendingSnapshot.docs) {
      docsById.set(docSnap.id, docSnap);
    }
    for (const docSnap of legacyPendingSnapshot.docs) {
      if (!docsById.has(docSnap.id)) {
        const data = docSnap.data() as Record<string, unknown>;
        if (!(data.nextAttempt instanceof Timestamp)) {
          docsById.set(docSnap.id, docSnap);
        }
      }
    }
    const docsToProcess = Array.from(docsById.values()).slice(0, 25);

    if (docsToProcess.length === 0) {
      return;
    }

    for (const docSnap of docsToProcess) {
      const data = docSnap.data() as Record<string, unknown>;
      const attempts = typeof data.attempts === "number" ? data.attempts : 0;
      const nextAttemptCount = attempts + 1;

      const envelope: OutboundEventEnvelope = {
        eventId: typeof data.eventId === "string" ? data.eventId : docSnap.id,
        eventType: (typeof data.eventType === "string" ? data.eventType : "member.updated") as OutboundEventType,
        eventVersion: "1.0",
        occurredAt: typeof data.occurredAt === "string" ? data.occurredAt : new Date().toISOString(),
        source: "fight-club-app",
        memberId: typeof data.memberId === "string" ? data.memberId : undefined,
        crmContactId: typeof data.crmContactId === "string" ? data.crmContactId : null,
        hasCrmContactId: data.hasCrmContactId === true,
        payload:
          typeof data.payload === "object" && data.payload !== null
            ? (data.payload as Record<string, unknown>)
            : {}
      };

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json"
        };
        if (process.env.CRM_WEBHOOK_BEARER_TOKEN) {
          headers.Authorization = `Bearer ${process.env.CRM_WEBHOOK_BEARER_TOKEN}`;
        }

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(envelope)
        });

        const responseText = await response.text();
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${responseText.slice(0, 200)}`);
        }

        await docSnap.ref.set(
          {
            status: "completed",
            attempts: nextAttemptCount,
            lastAttempt: Timestamp.now(),
            nextAttempt: null,
            responseStatus: response.status,
            responseBody: responseText.slice(0, 500),
            updatedAt: Timestamp.now()
          },
          { merge: true }
        );
      } catch (error) {
        const errorMessage = truncateError(error);
        const nextAttempt = nextAttemptTimestamp(nextAttemptCount);

        await docSnap.ref.set(
          {
            status: nextAttempt ? "pending" : "failed",
            attempts: nextAttemptCount,
            lastAttempt: Timestamp.now(),
            nextAttempt,
            error: errorMessage,
            updatedAt: Timestamp.now()
          },
          { merge: true }
        );
      }
    }
  }
);

/**
 * Inbound subscription webhook from payment gateway/CRM.
 * Updates membership type and linkage IDs.
 */
export const subscriptionWebhook = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const eventType = req.body?.eventType as string | undefined;
  if (eventType !== "subscription.started" && eventType !== "subscription.stopped") {
    res.status(400).json({ error: "invalid_event_type" });
    return;
  }

  const payload = (req.body?.payload ?? {}) as Record<string, unknown>;
  const memberId = typeof req.body?.memberId === "string"
    ? req.body.memberId
    : (typeof payload.memberId === "string" ? payload.memberId : "");
  const crmContactId = typeof req.body?.crmContactId === "string"
    ? req.body.crmContactId
    : (typeof payload.crmContactId === "string" ? payload.crmContactId : "");

  let memberRef: any = null;
  if (memberId) {
    memberRef = db.collection("members").doc(memberId);
    const exists = await memberRef.get();
    if (!exists.exists) {
      memberRef = null;
    }
  }

  if (!memberRef && crmContactId) {
    const byCrm = await db
      .collection("members")
      .where("crmContactId", "==", crmContactId)
      .limit(1)
      .get();
    if (!byCrm.empty) {
      memberRef = byCrm.docs[0].ref;
    }
  }

  if (!memberRef) {
    res.status(404).json({ error: "member_not_found" });
    return;
  }

  const explicitMembershipType =
    typeof payload.membershipType === "string" ? payload.membershipType : null;
  const mappedMembershipType =
    explicitMembershipType ??
    (eventType === "subscription.started" ? "monthly" : "inactive");

  await memberRef.set(
    {
      membershipType: mappedMembershipType,
      status: eventType === "subscription.started" ? "active" : "inactive",
      crmContactId: crmContactId || null,
      subscriptionUpdatedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    },
    { merge: true }
  );

  await enqueueOutboundEvent(
    eventType as OutboundEventType,
    {
      membershipType: mappedMembershipType,
      crmContactId: crmContactId || null,
      sourceEventType: eventType
    },
    memberRef.id
  );

  res.status(200).json({
    ok: true,
    eventType,
    memberId: memberRef.id,
    membershipType: mappedMembershipType
  });
});

/**
 * Appends attendance logs to Google Sheets so business owners can review data
 * without direct Firestore access.
 */
export const syncAttendanceToGoogleSheet = onDocumentCreated(
  {
    document: "attendanceLogs/{logId}",
    region: "us-central1",
    serviceAccount: "fight-club-attendance-dev@appspot.gserviceaccount.com"
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      logger.warn("Attendance sync skipped: missing document snapshot", {
        logId: event.params.logId
      });
      return;
    }

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const sheetTabName = process.env.GOOGLE_SHEETS_TAB_NAME ?? "Attendance";
    if (!spreadsheetId) {
      logger.warn("Attendance sync skipped: missing GOOGLE_SHEETS_SPREADSHEET_ID");
      return;
    }

    const logData = snapshot.data() as Record<string, unknown>;
    const memberId = typeof logData.memberId === "string" ? logData.memberId : "";
    if (!memberId) {
      logger.warn("Attendance sync skipped: missing memberId", { logId: snapshot.id });
      return;
    }

    try {
      const memberSnapshot = await db.collection("members").doc(memberId).get();
      const memberData = memberSnapshot.data() as Record<string, unknown> | undefined;

      const firstName = typeof memberData?.firstName === "string" ? memberData.firstName : "";
      const lastName = typeof memberData?.lastName === "string" ? memberData.lastName : "";
      const fullName = `${firstName} ${lastName}`.trim() || memberId;
      const membershipType =
        typeof memberData?.membershipType === "string" ? memberData.membershipType : "unknown";

      const rankAtCheckIn =
        typeof logData.memberRankAtCheckIn === "object" &&
        logData.memberRankAtCheckIn !== null
          ? (logData.memberRankAtCheckIn as Record<string, unknown>)
          : {};

      const belt = typeof rankAtCheckIn.belt === "string" ? rankAtCheckIn.belt : "unknown";
      const stripes = typeof rankAtCheckIn.stripes === "number" ? rankAtCheckIn.stripes : "";
      const attendanceLevel = typeof logData.attendanceLevel === "number" ? logData.attendanceLevel : "";
      const checkInIso = toIsoDate(logData.checkInTime);

      const auth = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/spreadsheets"]
      });
      const sheetsClient = google.sheets({
        version: "v4",
        auth
      });

      await sheetsClient.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetTabName}!A:F`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[fullName, checkInIso, membershipType, belt, String(stripes), String(attendanceLevel)]]
        }
      });

      await snapshot.ref.set(
        {
          googleSheetsSync: {
            status: "success",
            syncedAt: Timestamp.now()
          }
        },
        { merge: true }
      );
    } catch (error) {
      const errorMessage = truncateError(error);
      logger.error("Attendance sync to Google Sheets failed", {
        logId: snapshot.id,
        memberId,
        errorMessage
      });

      await snapshot.ref.set(
        {
          googleSheetsSync: {
            status: "failed",
            syncedAt: Timestamp.now(),
            errorMessage
          }
        },
        { merge: true }
      );
    }
  }
);

/**
 * Emits outbound event when a temp member is created (casual onboarding).
 */
export const onMemberCreated = onDocumentCreated("members/{memberId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    return;
  }
  const data = snapshot.data() as Record<string, unknown>;
  if (data.membershipType !== "temp") {
    return;
  }

  await enqueueOutboundEvent(
    "member.created_temp",
    {
      memberNumber: typeof data.memberNumber === "string" ? data.memberNumber : snapshot.id,
      firstName: typeof data.firstName === "string" ? data.firstName : "",
      lastName: typeof data.lastName === "string" ? data.lastName : "",
      email: typeof data.email === "string" ? data.email : "",
      phone: typeof data.phone === "string" ? data.phone : "",
      membershipType: "temp"
    },
    snapshot.id
  );
});

/**
 * Emits outbound event when a waiver is signed.
 */
export const onWaiverSigned = onDocumentCreated("waivers/{waiverId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    return;
  }
  const data = snapshot.data() as Record<string, unknown>;
  const memberId = typeof data.memberId === "string" ? data.memberId : undefined;

  await enqueueOutboundEvent(
    "waiver.signed",
    {
      waiverId: snapshot.id,
      version: typeof data.version === "string" ? data.version : "unknown",
      signedAt: toIsoDate(data.signedAt),
      firstName: typeof data.firstName === "string" ? data.firstName : "",
      lastName: typeof data.lastName === "string" ? data.lastName : "",
      email: typeof data.email === "string" ? data.email : "",
      phone: typeof data.phone === "string" ? data.phone : ""
    },
    memberId
  );
});

/**
 * Emits outbound event for attendance check-ins and streak milestones.
 */
export const onAttendanceCreated = onDocumentCreated("attendanceLogs/{logId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) {
    return;
  }
  const data = snapshot.data() as Record<string, unknown>;
  const memberId = typeof data.memberId === "string" ? data.memberId : undefined;

  const rank =
    typeof data.memberRankAtCheckIn === "object" && data.memberRankAtCheckIn !== null
      ? (data.memberRankAtCheckIn as Record<string, unknown>)
      : {};

  const streakWeeks =
    typeof data.streakWeeksAtCheckIn === "number" ? data.streakWeeksAtCheckIn : undefined;

  await enqueueOutboundEvent(
    "attendance.checked_in",
    {
      attendanceLogId: snapshot.id,
      checkInTime: toIsoDate(data.checkInTime),
      type: typeof data.type === "string" ? data.type : "unknown",
      locationId: typeof data.locationId === "string" ? data.locationId : "unknown",
      attendanceLevel: typeof data.attendanceLevel === "number" ? data.attendanceLevel : null,
      belt: typeof rank.belt === "string" ? rank.belt : null,
      stripes: typeof rank.stripes === "number" ? rank.stripes : null,
      streakWeeksAtCheckIn: streakWeeks ?? null,
      returningAfterBreak: data.returningAfterBreak === true
    },
    memberId
  );

  if (streakWeeks && streakWeeks % 4 === 0) {
    await enqueueOutboundEvent(
      "member.streak_milestone",
      {
        attendanceLogId: snapshot.id,
        streakWeeks,
        milestone: `${streakWeeks}_weeks`,
        checkInTime: toIsoDate(data.checkInTime)
      },
      memberId
    );
  }
});

/**
 * Emits outbound event when belt/stripe change is recorded.
 */
export const onMemberRankChanged = onDocumentCreated(
  "memberRankHistory/{historyId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) {
      return;
    }
    const data = snapshot.data() as Record<string, unknown>;
    const memberId = typeof data.memberId === "string" ? data.memberId : undefined;

    await enqueueOutboundEvent(
      "member.rank_changed",
      {
        historyId: snapshot.id,
        effectiveAt: toIsoDate(data.effectiveAt),
        fromBelt: typeof data.fromBelt === "string" ? data.fromBelt : null,
        fromStripes: typeof data.fromStripes === "number" ? data.fromStripes : null,
        toBelt: typeof data.toBelt === "string" ? data.toBelt : null,
        toStripes: typeof data.toStripes === "number" ? data.toStripes : null,
        note: typeof data.note === "string" ? data.note : ""
      },
      memberId
    );
  }
);

const STAFF_ROLES = new Set(["admin", "manager", "coach", "member"]);
const BOOTSTRAP_ADMIN_EMAILS = new Set([
  "shane@drpresident.com",
  "shane@highpeekpro.com"
]);

/**
 * Assigns Firebase custom role claim and mirrors role metadata into staffUsers.
 */
export const setStaffRole = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }

  const callerRole = request.auth.token.role;
  const callerEmail = request.auth.token.email;
  const canAssignRole =
    callerRole === "admin" ||
    (typeof callerEmail === "string" && BOOTSTRAP_ADMIN_EMAILS.has(callerEmail.toLowerCase()));

  if (!canAssignRole) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const emailRaw = request.data?.email;
  const roleRaw = request.data?.role;
  if (typeof emailRaw !== "string" || typeof roleRaw !== "string") {
    throw new HttpsError("invalid-argument", "email and role are required.");
  }

  const email = emailRaw.trim().toLowerCase();
  const role = roleRaw.trim().toLowerCase();
  if (!email || !STAFF_ROLES.has(role)) {
    throw new HttpsError("invalid-argument", "Invalid email or role.");
  }

  const userRecord = await adminAuth.getUserByEmail(email);

  const existingClaims = (userRecord.customClaims ?? {}) as Record<string, unknown>;
  await adminAuth.setCustomUserClaims(userRecord.uid, {
    ...existingClaims,
    role
  });

  await db.collection("staffUsers").doc(userRecord.uid).set(
    {
      email,
      role,
      isActive: role !== "member",
      updatedAt: Timestamp.now(),
      createdAt: Timestamp.now()
    },
    { merge: true }
  );

  logger.info("Staff role updated", {
    targetUid: userRecord.uid,
    targetEmail: email,
    role,
    changedBy: request.auth.uid
  });

  return {
    ok: true,
    uid: userRecord.uid,
    email,
    role
  };
});

/**
 * Creates a Firebase Auth user and assigns initial role claim.
 * Intended for admin-only staff onboarding from settings UI.
 */
export const createStaffUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }

  const callerRole = request.auth.token.role;
  const callerEmail = request.auth.token.email;
  const canCreateStaff =
    callerRole === "admin" ||
    (typeof callerEmail === "string" && BOOTSTRAP_ADMIN_EMAILS.has(callerEmail.toLowerCase()));

  if (!canCreateStaff) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const emailRaw = request.data?.email;
  const passwordRaw = request.data?.password;
  const roleRaw = request.data?.role;
  const displayNameRaw = request.data?.displayName;

  if (typeof emailRaw !== "string" || typeof passwordRaw !== "string" || typeof roleRaw !== "string") {
    throw new HttpsError("invalid-argument", "email, password, and role are required.");
  }

  const email = emailRaw.trim().toLowerCase();
  const password = passwordRaw.trim();
  const role = roleRaw.trim().toLowerCase();
  const displayName = typeof displayNameRaw === "string" ? displayNameRaw.trim() : "";

  if (!email || password.length < 6 || !STAFF_ROLES.has(role)) {
    throw new HttpsError("invalid-argument", "Invalid email, password, or role.");
  }

  const userRecord = await adminAuth.createUser({
    email,
    password,
    displayName: displayName || undefined
  });

  await adminAuth.setCustomUserClaims(userRecord.uid, {
    role
  });

  await db.collection("staffUsers").doc(userRecord.uid).set(
    {
      email,
      displayName: displayName || null,
      role,
      isActive: role !== "member",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    },
    { merge: true }
  );

  logger.info("Staff user created", {
    targetUid: userRecord.uid,
    targetEmail: email,
    role,
    createdBy: request.auth.uid
  });

  return {
    ok: true,
    uid: userRecord.uid,
    email,
    role
  };
});

/**
 * Links an existing staff user record to a member profile.
 * This allows a person to be both a member and staff role.
 */
export const linkStaffUserToMember = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }

  const callerRole = request.auth.token.role;
  const callerEmail = request.auth.token.email;
  const canLink =
    callerRole === "admin" ||
    callerRole === "manager" ||
    (typeof callerEmail === "string" && BOOTSTRAP_ADMIN_EMAILS.has(callerEmail.toLowerCase()));

  if (!canLink) {
    throw new HttpsError("permission-denied", "Admin or manager role required.");
  }

  const emailRaw = request.data?.email;
  const memberIdRaw = request.data?.memberId;
  if (typeof emailRaw !== "string" || typeof memberIdRaw !== "string") {
    throw new HttpsError("invalid-argument", "email and memberId are required.");
  }

  const email = emailRaw.trim().toLowerCase();
  const memberId = memberIdRaw.trim();
  if (!email || !memberId) {
    throw new HttpsError("invalid-argument", "Invalid email or memberId.");
  }

  const userRecord = await adminAuth.getUserByEmail(email);
  const memberSnapshot = await db.collection("members").doc(memberId).get();
  if (!memberSnapshot.exists) {
    throw new HttpsError("not-found", "Member not found.");
  }

  await db.collection("staffUsers").doc(userRecord.uid).set(
    {
      email,
      memberId,
      updatedAt: Timestamp.now(),
      linkedByUid: request.auth.uid,
      linkedAt: Timestamp.now()
    },
    { merge: true }
  );

  logger.info("Staff user linked to member", {
    staffUid: userRecord.uid,
    staffEmail: email,
    memberId,
    linkedBy: request.auth.uid
  });

  return {
    ok: true,
    uid: userRecord.uid,
    email,
    memberId
  };
});

/**
 * Links a waiver record to an existing member profile and updates member waiver status.
 */
export const linkWaiverToMember = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }

  const callerRole = request.auth.token.role;
  const callerEmail = request.auth.token.email;
  const canLinkWaiver =
    callerRole === "admin" ||
    callerRole === "manager" ||
    (typeof callerEmail === "string" && BOOTSTRAP_ADMIN_EMAILS.has(callerEmail.toLowerCase()));

  if (!canLinkWaiver) {
    throw new HttpsError("permission-denied", "Admin or manager role required.");
  }

  const memberIdRaw = request.data?.memberId;
  const waiverIdRaw = request.data?.waiverId;
  if (typeof memberIdRaw !== "string" || typeof waiverIdRaw !== "string") {
    throw new HttpsError("invalid-argument", "memberId and waiverId are required.");
  }

  const memberId = memberIdRaw.trim();
  const waiverId = waiverIdRaw.trim();
  if (!memberId || !waiverId) {
    throw new HttpsError("invalid-argument", "Invalid memberId or waiverId.");
  }

  const memberRef = db.collection("members").doc(memberId);
  const waiverRef = db.collection("waivers").doc(waiverId);
  const [memberSnapshot, waiverSnapshot] = await Promise.all([memberRef.get(), waiverRef.get()]);

  if (!memberSnapshot.exists) {
    throw new HttpsError("not-found", "Member not found.");
  }
  if (!waiverSnapshot.exists) {
    throw new HttpsError("not-found", "Waiver not found.");
  }

  const waiverData = waiverSnapshot.data() as Record<string, unknown>;
  const signedAt = waiverData.signedAt instanceof Timestamp ? waiverData.signedAt : Timestamp.now();
  const version = typeof waiverData.version === "string" ? waiverData.version : null;

  await Promise.all([
    waiverRef.set(
      {
        memberId,
        linkedAt: Timestamp.now(),
        linkedByUid: request.auth.uid
      },
      { merge: true }
    ),
    memberRef.set(
      {
        waiverAcceptedAt: signedAt,
        waiverDisclaimerVersion: version,
        updatedAt: Timestamp.now()
      },
      { merge: true }
    )
  ]);

  logger.info("Waiver linked to member", {
    waiverId,
    memberId,
    linkedBy: request.auth.uid
  });

  return {
    ok: true,
    memberId,
    waiverId
  };
});
