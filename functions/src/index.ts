import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";

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

