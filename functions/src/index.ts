import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions";
import { google } from "googleapis";
import { createHash } from "node:crypto";

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
const INBOUND_EVENT_COLLECTION = "inboundWebhookEvents";
const KIOSK_SETTINGS_DOC_ID = "kioskSecurity";

function hashPin(pin: string): string {
  return createHash("sha256").update(pin).digest("hex");
}

function isFourDigitPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

function kioskSettingsRef() {
  return db.collection("settings").doc(KIOSK_SETTINGS_DOC_ID);
}

async function markInboundEventProcessed(source: string, eventId: string): Promise<boolean> {
  const normalizedSource = source.trim().toLowerCase();
  const normalizedEventId = eventId.trim();
  if (!normalizedSource || !normalizedEventId) {
    return false;
  }

  const docId = `${normalizedSource}:${normalizedEventId}`;
  const ref = db.collection(INBOUND_EVENT_COLLECTION).doc(docId);

  try {
    await ref.create({
      source: normalizedSource,
      eventId: normalizedEventId,
      createdAt: Timestamp.now()
    });
    return false;
  } catch (error) {
    const code = (error as { code?: number | string } | undefined)?.code;
    if (code === 6 || code === "already-exists") {
      return true;
    }
    throw error;
  }
}

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

function formatClassTimeRange(startTime: unknown, endTime: unknown): string {
  const formatTime = (value: unknown): string => {
    if (typeof value !== "string") {
      return "";
    }

    const match = /^(\d{2}):(\d{2})$/.exec(value);
    if (!match) {
      return value;
    }

    const hour = Number(match[1]);
    const minute = match[2];
    const period = hour >= 12 ? "pm" : "am";
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minute} ${period}`;
  };

  const start = formatTime(startTime);
  const end = formatTime(endTime);
  return start && end ? `${start}–${end}` : start || end;
}

function toE164Phone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\+\d{8,15}$/.test(trimmed)) {
    return trimmed;
  }

  const digits = trimmed.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  if (digits.startsWith("00") && digits.length > 2) {
    return `+${digits.slice(2)}`;
  }

  // AU default normalization for local formats.
  if (digits.startsWith("0") && digits.length >= 9) {
    return `+61${digits.slice(1)}`;
  }

  if (digits.startsWith("61") && digits.length >= 10) {
    return `+${digits}`;
  }

  if (digits.length === 9) {
    return `+61${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

function enrichPayloadPhones(payload: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };

  if (typeof next.phone === "string") {
    const formatted = toE164Phone(next.phone);
    if (formatted) {
      if (next.phone !== formatted) {
        next.phoneRaw = next.phone;
      }
      next.phone = formatted;
      next.phoneE164 = formatted;
    }
  }

  if (typeof next.member === "object" && next.member !== null) {
    const member = { ...(next.member as Record<string, unknown>) };
    if (typeof member.phone === "string") {
      const formatted = toE164Phone(member.phone);
      if (formatted) {
        if (member.phone !== formatted) {
          member.phoneRaw = member.phone;
        }
        member.phone = formatted;
        member.phoneE164 = formatted;
      }
    }
    next.member = member;
  }

  return next;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readInboundString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("{{") && trimmed.endsWith("}}")) {
    return null;
  }
  return trimmed;
}

function readInboundNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || (trimmed.startsWith("{{") && trimmed.endsWith("}}"))) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

async function allocateMemberNumber(): Promise<string> {
  const counterRef = db.collection("settings").doc("memberNumberCounter");
  const nextValue = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(counterRef);
    const data = snapshot.data() as Record<string, unknown> | undefined;
    const current = typeof data?.nextValue === "number" && Number.isFinite(data.nextValue)
      ? data.nextValue
      : 1;

    tx.set(
      counterRef,
      {
        nextValue: current + 1,
        updatedAt: Timestamp.now()
      },
      { merge: true }
    );

    return current;
  });

  return `ASH-${String(nextValue).padStart(6, "0")}`;
}

function buildMemberSnapshot(
  memberId: string | undefined,
  memberData: Record<string, unknown> | undefined
): Record<string, unknown> | null {
  if (!memberId || !memberData) {
    return null;
  }

  const firstName = typeof memberData.firstName === "string" ? memberData.firstName : "";
  const lastName = typeof memberData.lastName === "string" ? memberData.lastName : "";
  const nickname = typeof memberData.nickname === "string" ? memberData.nickname : "";
  const rank =
    typeof memberData.rank === "object" && memberData.rank !== null
      ? (memberData.rank as Record<string, unknown>)
      : {};
  const rankProfile =
    typeof memberData.rankProfile === "object" && memberData.rankProfile !== null
      ? (memberData.rankProfile as Record<string, unknown>)
      : null;

  return {
    id: memberId,
    memberId,
    memberNumber: readString(memberData.memberNumber) ?? memberId,
    firstName,
    lastName,
    nickname,
    fullName: `${firstName} ${lastName}`.trim(),
    email: readString(memberData.email) ?? "",
    phone: readString(memberData.phone) ?? "",
    crmContactId: readString(memberData.crmContactId),
    crmMemberId: readString(memberData.crmMemberId) ?? readString(memberData.crmContactId),
    hasCrmContactId: Boolean(readString(memberData.crmContactId) || readString(memberData.crmMemberId)),
    status: readString(memberData.status) ?? "active",
    membershipType: readString(memberData.membershipType) ?? "unknown",
    birthDate: readString(memberData.birthDate),
    ageBand: readString(memberData.ageBand),
    // Preserve the original CRM contract. New rankProfile fields are additive.
    rank: {
      belt: readString(rank.belt) ?? "white",
      stripes: readNumber(rank.stripes) ?? 0
    },
    rankProfile: rankProfile
      ? {
          ageBand: readString(rankProfile.ageBand),
          rankSystem: readString(rankProfile.rankSystem),
          rankStepId: readString(rankProfile.rankStepId),
          rankStepOrder: readNumber(rankProfile.rankStepOrder),
          beltName: readString(rankProfile.beltName),
          baseColour: readString(rankProfile.baseColour),
          stripeColour: readString(rankProfile.stripeColour),
          degreeLevel:
            typeof rankProfile.degreeLevel === "number" || typeof rankProfile.degreeLevel === "string"
              ? rankProfile.degreeLevel
              : null
        }
      : null,
    streak: {
      currentWeeks: readNumber(memberData.streakCurrentWeeks),
      bestWeeks: readNumber(memberData.streakBestWeeks),
      lastWeekId: readString(memberData.streakLastWeekId)
    },
    totals: {
      totalCheckIns: readNumber(memberData.totalCheckIns)
    },
    waiver: {
      acceptedAt: memberData.waiverAcceptedAt ? toIsoDate(memberData.waiverAcceptedAt) : null,
      version: readString(memberData.waiverDisclaimerVersion)
    }
  };
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
    payload: enrichPayloadPhones(payload)
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
        payload: enrichPayloadPhones(
          typeof data.payload === "object" && data.payload !== null
            ? (data.payload as Record<string, unknown>)
            : {}
        )
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
  const eventId = typeof req.body?.eventId === "string"
    ? req.body.eventId
    : (typeof payload.eventId === "string" ? payload.eventId : "");
  if (eventId) {
    const duplicate = await markInboundEventProcessed("subscription", eventId);
    if (duplicate) {
      res.status(200).json({ ok: true, duplicate: true, eventId });
      return;
    }
  }
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
      crmMemberId: crmContactId || null,
      subscriptionUpdatedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    },
    { merge: true }
  );
  const updatedMemberSnapshot = await memberRef.get();
  const updatedMemberData = updatedMemberSnapshot.data() as Record<string, unknown> | undefined;
  const member = buildMemberSnapshot(memberRef.id, updatedMemberData);

  await enqueueOutboundEvent(
    eventType as OutboundEventType,
    {
      membershipType: mappedMembershipType,
      crmContactId: crmContactId || null,
      sourceEventType: eventType,
      member
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
 * Inbound CRM member upsert webhook.
 * Creates/updates member records from CRM using crmContactId as the primary external key.
 */
export const upsertMemberFromCrm = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const eventType = readInboundString(req.body?.eventType);
  if (eventType && eventType !== "crm.member.upsert") {
    res.status(400).json({ error: "invalid_event_type" });
    return;
  }

  const payload = (req.body?.payload ?? {}) as Record<string, unknown>;
  const eventId = readInboundString(req.body?.eventId) ?? readInboundString(payload.eventId);
  if (eventId) {
    const duplicate = await markInboundEventProcessed("crm-member-upsert", eventId);
    if (duplicate) {
      res.status(200).json({ ok: true, duplicate: true, eventId });
      return;
    }
  }

  const crmContactId = readInboundString(payload.crmContactId) ?? readInboundString(req.body?.crmContactId);
  if (!crmContactId) {
    res.status(400).json({ error: "crmContactId_required" });
    return;
  }

  const firstName = readInboundString(payload.firstName) ?? "";
  const lastName = readInboundString(payload.lastName) ?? "";
  const nickname = readInboundString(payload.nickname) ?? "";
  const email = readInboundString(payload.email) ?? "";
  const phone = readInboundString(payload.phone) ?? "";
  const membershipType = readInboundString(payload.membershipType) ?? "monthly";
  const status = readInboundString(payload.status) ?? "active";

  const ageBand = readInboundString(payload.ageBand) ?? "adult_16_plus";
  const rankSystem = readInboundString(payload.rankSystem);
  const rankStepId = readInboundString(payload.rankStepId);
  const rankStepOrder = readInboundNumber(payload.rankStepOrder);
  const beltName = readInboundString(payload.beltName);
  const baseColour = readInboundString(payload.baseColour);
  const stripeColour = readInboundString(payload.stripeColour);
  const degreeLevelNumber = readInboundNumber(payload.degreeLevel);
  const degreeLevelString = readInboundString(payload.degreeLevel);
  const degreeLevel = degreeLevelNumber ?? degreeLevelString;

  const rankProfile = {
    ageBand,
    rankSystem,
    rankStepId,
    rankStepOrder,
    beltName,
    baseColour,
    stripeColour,
    degreeLevel: degreeLevel ?? null
  };

  const legacyRank = {
    belt: (baseColour ?? beltName ?? "white").toLowerCase().replace(/\s+/g, "_").replace(/\//g, "_"),
    stripes: typeof degreeLevelNumber === "number" ? degreeLevelNumber : 0
  };

  let memberRef;
  let operation: "created" | "updated" = "updated";

  const byCrm = await db
    .collection("members")
    .where("crmContactId", "==", crmContactId)
    .limit(1)
    .get();

  if (!byCrm.empty) {
    memberRef = byCrm.docs[0].ref;
  } else {
    memberRef = db.collection("members").doc();
    operation = "created";
  }

  const existingSnapshot = await memberRef.get();
  const existingData = existingSnapshot.data() as Record<string, unknown> | undefined;
  const existingMemberNumber = readString(existingData?.memberNumber);
  const memberNumber = existingMemberNumber ?? await allocateMemberNumber();

  await memberRef.set(
    {
      memberId: memberRef.id,
      memberNumber,
      firstName,
      lastName,
      nickname,
      nicknameLower: nickname ? nickname.toLowerCase() : null,
      email,
      phone,
      membershipType,
      status,
      ageBand,
      rankProfile,
      rank: legacyRank,
      crmContactId,
      crmMemberId: crmContactId,
      sourceSystem: "hpp",
      updatedAt: Timestamp.now(),
      createdAt: existingData?.createdAt instanceof Timestamp ? existingData.createdAt : Timestamp.now()
    },
    { merge: true }
  );

  res.status(200).json({
    ok: true,
    eventType: "crm.member.upsert",
    operation,
    memberId: memberRef.id,
    memberNumber,
    crmContactId
  });
});

/**
 * Inbound CRM link webhook.
 * Stores CRM contact ID on an existing member without changing subscription status.
 */
export const linkCrmContactWebhook = onRequest(async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const memberId = typeof req.body?.memberId === "string" ? req.body.memberId.trim() : "";
  const crmContactId = typeof req.body?.crmContactId === "string" ? req.body.crmContactId.trim() : "";
  const payload = (req.body?.payload ?? {}) as Record<string, unknown>;
  const eventId = typeof req.body?.eventId === "string"
    ? req.body.eventId
    : (typeof payload.eventId === "string" ? payload.eventId : "");

  if (eventId) {
    const duplicate = await markInboundEventProcessed("crm-contact-link", eventId);
    if (duplicate) {
      res.status(200).json({ ok: true, duplicate: true, eventId });
      return;
    }
  }

  if (!memberId || !crmContactId) {
    res.status(400).json({ error: "memberId_and_crmContactId_required" });
    return;
  }

  const memberRef = db.collection("members").doc(memberId);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    res.status(404).json({ error: "member_not_found" });
    return;
  }

  await memberRef.set(
    {
      crmContactId,
      crmMemberId: crmContactId,
      updatedAt: Timestamp.now()
    },
    { merge: true }
  );
  const updatedMemberSnapshot = await memberRef.get();
  const updatedMemberData = updatedMemberSnapshot.data() as Record<string, unknown> | undefined;
  const member = buildMemberSnapshot(memberId, updatedMemberData);

  await enqueueOutboundEvent(
    "member.updated",
    {
      memberId,
      crmContactId,
      sourceEventType: "crm.contact_linked",
      member,
      ...payload
    },
    memberId
  );

  res.status(200).json({ ok: true, memberId, crmContactId });
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
      const classSession =
        typeof logData.classSession === "object" && logData.classSession !== null
          ? (logData.classSession as Record<string, unknown>)
          : {};
      const classTime = formatClassTimeRange(classSession.startTime, classSession.endTime);
      const className =
        typeof classSession.actualClassName === "string" ? classSession.actualClassName : "";

      const auth = new google.auth.GoogleAuth({
        scopes: ["https://www.googleapis.com/auth/spreadsheets"]
      });
      const sheetsClient = google.sheets({
        version: "v4",
        auth
      });

      await sheetsClient.spreadsheets.values.append({
        spreadsheetId,
        range: `${sheetTabName}!A:H`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[
            fullName,
            checkInIso,
            membershipType,
            belt,
            String(stripes),
            String(attendanceLevel),
            classTime,
            className
          ]]
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
  await snapshot.ref.set(
    {
      memberId: snapshot.id,
      updatedAt: Timestamp.now()
    },
    { merge: true }
  );
  const data = snapshot.data() as Record<string, unknown>;
  if (data.membershipType !== "temp") {
    return;
  }
  // Temp onboarding sends a single consolidated event from onAttendanceCreated.
  // This avoids race conditions in CRM workflows (member/waiver/attendance sequencing).
  return;
});


/**
 * Emits outbound event when member status changes via admin/profile updates.
 */
export const onMemberUpdated = onDocumentUpdated("members/{memberId}", async (event) => {
  const beforeData = event.data?.before.data() as Record<string, unknown> | undefined;
  const afterData = event.data?.after.data() as Record<string, unknown> | undefined;
  const memberId = event.params.memberId;

  if (!afterData) {
    return;
  }

  const beforeStatus = readString(beforeData?.status) ?? "null";
  const afterStatus = readString(afterData.status) ?? "null";

  if (beforeStatus === afterStatus) {
    return;
  }

  const member = buildMemberSnapshot(memberId, afterData);
  await enqueueOutboundEvent(
    "member.updated",
    {
      sourceEventType: "member.status_changed",
      previousStatus: beforeStatus,
      status: afterStatus,
      member
    },
    memberId
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
  let memberData: Record<string, unknown> | undefined;

  if (memberId) {
    const memberSnapshot = await db.collection("members").doc(memberId).get();
    memberData = memberSnapshot.data() as Record<string, unknown> | undefined;
    if (memberData?.membershipType === "temp") {
      // Temp onboarding sends one consolidated event from onAttendanceCreated.
      return;
    }
  }

  const member = buildMemberSnapshot(memberId, memberData);
  await enqueueOutboundEvent(
    "waiver.signed",
    {
      waiverId: snapshot.id,
      version: typeof data.version === "string" ? data.version : "unknown",
      signedAt: toIsoDate(data.signedAt),
      firstName: typeof data.firstName === "string" ? data.firstName : "",
      lastName: typeof data.lastName === "string" ? data.lastName : "",
      email: typeof data.email === "string" ? data.email : "",
      phone: typeof data.phone === "string" ? data.phone : "",
      member
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
  const type = typeof data.type === "string" ? data.type : "unknown";
  let memberData: Record<string, unknown> | undefined;

  const rankProfileAtCheckIn =
    typeof data.memberRankProfileAtCheckIn === "object" && data.memberRankProfileAtCheckIn !== null
      ? (data.memberRankProfileAtCheckIn as Record<string, unknown>)
      : null;
  const rankAtCheckIn =
    typeof data.memberRankAtCheckIn === "object" && data.memberRankAtCheckIn !== null
      ? (data.memberRankAtCheckIn as Record<string, unknown>)
      : {};
  const classSession =
    typeof data.classSession === "object" && data.classSession !== null
      ? (data.classSession as Record<string, unknown>)
      : null;

  const streakWeeks =
    typeof data.streakWeeksAtCheckIn === "number" ? data.streakWeeksAtCheckIn : undefined;

  if (memberId) {
    const memberSnapshot = await db.collection("members").doc(memberId).get();
    memberData = memberSnapshot.data() as Record<string, unknown> | undefined;
  }
  const memberSnapshotPayload = buildMemberSnapshot(memberId, memberData);
  const attendancePayload = {
    attendanceLogId: snapshot.id,
    checkInTime: toIsoDate(data.checkInTime),
    type,
    locationId: typeof data.locationId === "string" ? data.locationId : "unknown",
    status: typeof data.status === "string" ? data.status : "completed",
    attendanceLevel: typeof data.attendanceLevel === "number" ? data.attendanceLevel : null,
    // Preserve the original flat/structured attendance fields for existing CRM mappings.
    belt: typeof rankAtCheckIn.belt === "string" ? rankAtCheckIn.belt : null,
    stripes: typeof rankAtCheckIn.stripes === "number" ? rankAtCheckIn.stripes : null,
    streakWeeksAtCheckIn: streakWeeks ?? null,
    daysSinceLastCheckIn:
      typeof data.daysSinceLastCheckIn === "number" ? data.daysSinceLastCheckIn : null,
    returningAfterBreak: data.returningAfterBreak === true,
    rankSystemAtCheckIn: rankProfileAtCheckIn ? readString(rankProfileAtCheckIn.rankSystem) : null,
    rankStepIdAtCheckIn: rankProfileAtCheckIn ? readString(rankProfileAtCheckIn.rankStepId) : null,
    rankStepOrderAtCheckIn: rankProfileAtCheckIn ? readNumber(rankProfileAtCheckIn.rankStepOrder) : null,
    beltNameAtCheckIn: rankProfileAtCheckIn ? readString(rankProfileAtCheckIn.beltName) : null,
    baseColourAtCheckIn: rankProfileAtCheckIn ? readString(rankProfileAtCheckIn.baseColour) : null,
    stripeColourAtCheckIn: rankProfileAtCheckIn ? readString(rankProfileAtCheckIn.stripeColour) : null,
    degreeLevelAtCheckIn:
      rankProfileAtCheckIn && (typeof rankProfileAtCheckIn.degreeLevel === "number" || typeof rankProfileAtCheckIn.degreeLevel === "string")
        ? rankProfileAtCheckIn.degreeLevel
        : null,
    className: classSession ? readString(classSession.actualClassName) : null,
    classStartTime: classSession ? readString(classSession.startTime) : null,
    classEndTime: classSession ? readString(classSession.endTime) : null,
    classDate: classSession ? readString(classSession.classDate) : null,
    scheduledClassName: classSession ? readString(classSession.scheduledClassName) : null,
    classSubstitution: classSession?.isSubstitution === true,
    classSession
  };

  // Single consolidated temp onboarding event:
  // member + waiver summary + attendance in one payload.
  if (type === "casual" && memberId && memberData?.membershipType === "temp") {
    const waiverDocs = await db.collection("waivers").where("memberId", "==", memberId).limit(10).get();
    let latestWaiver: Record<string, unknown> | null = null;
    let latestSignedAt = 0;

    for (const waiverDoc of waiverDocs.docs) {
      const waiver = waiverDoc.data() as Record<string, unknown>;
      const signedAt = waiver.signedAt instanceof Timestamp ? waiver.signedAt.toMillis() : 0;
      if (signedAt >= latestSignedAt) {
        latestSignedAt = signedAt;
        latestWaiver = { id: waiverDoc.id, ...waiver };
      }
    }

    await enqueueOutboundEvent(
      "member.created_temp",
      {
        member: memberSnapshotPayload,
        waiver: latestWaiver
          ? {
              waiverId: latestWaiver.id,
              version: typeof latestWaiver.version === "string" ? latestWaiver.version : "unknown",
              signedAt: toIsoDate(latestWaiver.signedAt),
              expiresAt: toIsoDate(latestWaiver.expiresAt),
              acceptedAt: memberSnapshotPayload?.waiver && typeof memberSnapshotPayload.waiver === "object"
                ? ((memberSnapshotPayload.waiver as Record<string, unknown>).acceptedAt ?? null)
                : null
            }
          : {
              waiverId: null,
              version: null,
              signedAt: null,
              expiresAt: null,
              acceptedAt: memberSnapshotPayload?.waiver && typeof memberSnapshotPayload.waiver === "object"
                ? ((memberSnapshotPayload.waiver as Record<string, unknown>).acceptedAt ?? null)
                : null
            },
        attendance: attendancePayload,
        streak: memberSnapshotPayload?.streak ?? {
          currentWeeks: streakWeeks ?? null,
          bestWeeks: null,
          lastWeekId: null
        },
        totals: memberSnapshotPayload?.totals ?? {
          totalCheckIns: null
        }
      },
      memberId
    );
    return;
  }

  await enqueueOutboundEvent(
    "attendance.checked_in",
    {
      // Keep legacy mapped fields stable.
      attendanceLogId: attendancePayload.attendanceLogId,
      checkInTime: attendancePayload.checkInTime,
      type: attendancePayload.type,
      locationId: attendancePayload.locationId,
      attendanceLevel: attendancePayload.attendanceLevel,
      belt: attendancePayload.belt,
      stripes: attendancePayload.stripes,
      streakWeeksAtCheckIn: attendancePayload.streakWeeksAtCheckIn,
      daysSinceLastCheckIn: attendancePayload.daysSinceLastCheckIn,
      returningAfterBreak: attendancePayload.returningAfterBreak,
      rankSystemAtCheckIn: attendancePayload.rankSystemAtCheckIn,
      rankStepIdAtCheckIn: attendancePayload.rankStepIdAtCheckIn,
      rankStepOrderAtCheckIn: attendancePayload.rankStepOrderAtCheckIn,
      beltNameAtCheckIn: attendancePayload.beltNameAtCheckIn,
      baseColourAtCheckIn: attendancePayload.baseColourAtCheckIn,
      stripeColourAtCheckIn: attendancePayload.stripeColourAtCheckIn,
      degreeLevelAtCheckIn: attendancePayload.degreeLevelAtCheckIn,
      className: attendancePayload.className,
      classStartTime: attendancePayload.classStartTime,
      classEndTime: attendancePayload.classEndTime,
      classDate: attendancePayload.classDate,
      scheduledClassName: attendancePayload.scheduledClassName,
      classSubstitution: attendancePayload.classSubstitution,
      // Stable structured blocks for CRM routing/storage.
      member: memberSnapshotPayload,
      attendance: attendancePayload,
      streak: memberSnapshotPayload?.streak ?? {
        currentWeeks: streakWeeks ?? null,
        bestWeeks: null,
        lastWeekId: null
      },
      totals: memberSnapshotPayload?.totals ?? {
        totalCheckIns: null
      },
      waiver: memberSnapshotPayload?.waiver ?? {
        acceptedAt: null,
        version: null
      }
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
        checkInTime: toIsoDate(data.checkInTime),
        member: memberSnapshotPayload,
        attendance: attendancePayload,
        totals: memberSnapshotPayload?.totals ?? {
          totalCheckIns: null
        }
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
    let memberData: Record<string, unknown> | undefined;
    if (memberId) {
      const memberSnapshot = await db.collection("members").doc(memberId).get();
      memberData = memberSnapshot.data() as Record<string, unknown> | undefined;
    }
    const member = buildMemberSnapshot(memberId, memberData);

    await enqueueOutboundEvent(
      "member.rank_changed",
      {
        historyId: snapshot.id,
        effectiveAt: toIsoDate(data.effectiveAt),
        // Preserve the original rank-change payload fields alongside the expanded model.
        fromBelt: typeof data.fromBelt === "string" ? data.fromBelt : null,
        fromStripes: typeof data.fromStripes === "number" ? data.fromStripes : null,
        toBelt: typeof data.toBelt === "string" ? data.toBelt : null,
        toStripes: typeof data.toStripes === "number" ? data.toStripes : null,
        note: typeof data.note === "string" ? data.note : "",
        fromAgeBand: typeof data.fromAgeBand === "string" ? data.fromAgeBand : null,
        toAgeBand: typeof data.toAgeBand === "string" ? data.toAgeBand : null,
        fromRankStepId: typeof data.fromRankStepId === "string" ? data.fromRankStepId : null,
        toRankStepId: typeof data.toRankStepId === "string" ? data.toRankStepId : null,
        fromBeltName: typeof data.fromBeltName === "string" ? data.fromBeltName : null,
        toBeltName: typeof data.toBeltName === "string" ? data.toBeltName : null,
        toDegreeLevel:
          typeof data.toDegreeLevel === "number" || typeof data.toDegreeLevel === "string"
            ? data.toDegreeLevel
            : null,
        member
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
 * Resets password for an existing Firebase Auth user.
 * Admin-only recovery action from staff settings.
 */
export const setStaffPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }

  const callerRole = request.auth.token.role;
  const callerEmail = request.auth.token.email;
  const canResetPassword =
    callerRole === "admin" ||
    (typeof callerEmail === "string" && BOOTSTRAP_ADMIN_EMAILS.has(callerEmail.toLowerCase()));

  if (!canResetPassword) {
    throw new HttpsError("permission-denied", "Admin role required.");
  }

  const emailRaw = request.data?.email;
  const newPasswordRaw = request.data?.newPassword;
  if (typeof emailRaw !== "string" || typeof newPasswordRaw !== "string") {
    throw new HttpsError("invalid-argument", "email and newPassword are required.");
  }

  const email = emailRaw.trim().toLowerCase();
  const newPassword = newPasswordRaw.trim();
  if (!email || newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "Invalid email or new password.");
  }

  const userRecord = await adminAuth.getUserByEmail(email);
  await adminAuth.updateUser(userRecord.uid, {
    password: newPassword
  });

  logger.info("Staff password reset", {
    targetUid: userRecord.uid,
    targetEmail: email,
    resetBy: request.auth.uid
  });

  return {
    ok: true,
    uid: userRecord.uid,
    email
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

/**
 * Manually retries a failed outbound webhook event.
 * Does not modify payload/envelope content.
 */
export const retryWebhookEvent = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }

  const callerRole = request.auth.token.role;
  const callerEmail = request.auth.token.email;
  const canRetry =
    callerRole === "admin" ||
    callerRole === "manager" ||
    callerRole === "coach" ||
    (typeof callerEmail === "string" && BOOTSTRAP_ADMIN_EMAILS.has(callerEmail.toLowerCase()));

  if (!canRetry) {
    throw new HttpsError("permission-denied", "Coach, manager, or admin role required.");
  }

  const eventIdRaw = request.data?.eventId;
  const forceRaw = request.data?.force;
  if (typeof eventIdRaw !== "string" || !eventIdRaw.trim()) {
    throw new HttpsError("invalid-argument", "eventId is required.");
  }

  const eventId = eventIdRaw.trim();
  const force = forceRaw === true;
  const eventRef = db.collection("webhookEvents").doc(eventId);
  const snapshot = await eventRef.get();
  if (!snapshot.exists) {
    throw new HttpsError("not-found", "Webhook event not found.");
  }

  const data = snapshot.data() as Record<string, unknown>;
  const status = typeof data.status === "string" ? data.status : "unknown";
  if (status === "completed" && !force) {
    throw new HttpsError("failed-precondition", "Completed events require force=true to retry.");
  }

  await eventRef.set(
    {
      status: "pending",
      nextAttempt: Timestamp.now(),
      error: null,
      updatedAt: Timestamp.now(),
      manualRetryAt: Timestamp.now(),
      manualRetryBy: request.auth.uid
    },
    { merge: true }
  );

  logger.info("Webhook event manually retried", {
    eventId,
    previousStatus: status,
    force,
    retriedBy: request.auth.uid
  });

  return {
    ok: true,
    eventId,
    previousStatus: status
  };
});

/**
 * Records kiosk lock events for audit.
 * Kiosk can call this without auth.
 */
export const recordKioskLockEvent = onCall(async (request) => {
  const typeRaw = request.data?.type;
  const reasonRaw = request.data?.reason;
  const locationIdRaw = request.data?.locationId;

  const type = typeof typeRaw === "string" ? typeRaw.trim().toLowerCase() : "";
  const reason = typeof reasonRaw === "string" ? reasonRaw.trim().toLowerCase() : "";
  const locationId = typeof locationIdRaw === "string" && locationIdRaw.trim() ? locationIdRaw.trim() : "ashmore";

  if ((type !== "locked" && type !== "unlocked") || !reason) {
    throw new HttpsError("invalid-argument", "type and reason are required.");
  }

  await db.collection("kioskLockEvents").add({
    locationId,
    type,
    reason,
    createdAt: Timestamp.now()
  });

  return { ok: true };
});

/**
 * Sets shared kiosk coach/admin PIN hashes in settings.
 * Admin/manager only.
 */
export const setKioskPins = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign-in required.");
  }

  const callerRole = request.auth.token.role;
  const callerEmail = request.auth.token.email;
  const canManagePins =
    callerRole === "admin" ||
    callerRole === "manager" ||
    (typeof callerEmail === "string" && BOOTSTRAP_ADMIN_EMAILS.has(callerEmail.toLowerCase()));

  if (!canManagePins) {
    throw new HttpsError("permission-denied", "Admin or manager role required.");
  }

  const coachPinRaw = request.data?.coachPin;
  const adminPinRaw = request.data?.adminPin;
  const coachPin = typeof coachPinRaw === "string" ? coachPinRaw.trim() : "";
  const adminPin = typeof adminPinRaw === "string" ? adminPinRaw.trim() : "";

  if (!isFourDigitPin(coachPin) || !isFourDigitPin(adminPin)) {
    throw new HttpsError("invalid-argument", "coachPin and adminPin must be 4 digits.");
  }

  await kioskSettingsRef().set(
    {
      coachPinHash: hashPin(coachPin),
      adminPinHash: hashPin(adminPin),
      pinUpdatedAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      updatedByUid: request.auth.uid
    },
    { merge: true }
  );

  return { ok: true };
});

/**
 * Unlocks kiosk by validating submitted 4-digit PIN against stored hashes.
 * Kiosk can call this without auth.
 */
export const unlockKioskWithPin = onCall(async (request) => {
  const pinRaw = request.data?.pin;
  const locationIdRaw = request.data?.locationId;
  const pin = typeof pinRaw === "string" ? pinRaw.trim() : "";
  const locationId = typeof locationIdRaw === "string" && locationIdRaw.trim() ? locationIdRaw.trim() : "ashmore";

  if (!isFourDigitPin(pin)) {
    throw new HttpsError("invalid-argument", "PIN must be 4 digits.");
  }

  const settingsSnapshot = await kioskSettingsRef().get();
  const settingsData = settingsSnapshot.data() as Record<string, unknown> | undefined;
  const candidateHash = hashPin(pin);
  const coachPinHash = typeof settingsData?.coachPinHash === "string" ? settingsData.coachPinHash : "";
  const adminPinHash = typeof settingsData?.adminPinHash === "string" ? settingsData.adminPinHash : "";

  let unlockedByRole: "coach" | "admin" | null = null;
  if (candidateHash && coachPinHash && candidateHash === coachPinHash) {
    unlockedByRole = "coach";
  } else if (candidateHash && adminPinHash && candidateHash === adminPinHash) {
    unlockedByRole = "admin";
  }

  if (!unlockedByRole) {
    throw new HttpsError("permission-denied", "Invalid PIN.");
  }

  await db.collection("kioskLockEvents").add({
    locationId,
    type: "unlocked",
    reason: "manual_override",
    unlockedByRole,
    unlockedByStaffId: request.auth?.uid ?? null,
    createdAt: Timestamp.now()
  });

  return {
    ok: true,
    unlockedByRole
  };
});
