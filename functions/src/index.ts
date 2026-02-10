import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { google } from "googleapis";

initializeApp();

type WebhookEventType = "check_in" | "member_update" | "waiver_signed";

interface WebhookEvent {
  type: WebhookEventType;
  payload: Record<string, unknown>;
}

const db = getFirestore();

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
