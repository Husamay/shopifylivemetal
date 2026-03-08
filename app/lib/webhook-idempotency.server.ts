import { createHash } from "node:crypto";
import prisma from "../db.server";

const DELIVERY_ID_HEADER = "x-shopify-webhook-id";

export type WebhookAuth = { shop: string | null; topic: string; payload?: unknown };

/**
 * Delivery id from request (Shopify sends X-Shopify-Webhook-Id) or null if missing.
 */
export function getDeliveryId(request: Request): string | null {
  return request.headers.get(DELIVERY_ID_HEADER);
}

/**
 * Fallback idempotency key when Shopify does not send a delivery id.
 */
export function fallbackDeliveryKey(topic: string, shop: string | null, payload: unknown): string {
  const raw = `${topic}:${shop ?? ""}:${JSON.stringify(payload ?? {})}`;
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Returns true if this delivery was already processed (duplicate).
 */
export async function isDuplicateDelivery(deliveryId: string): Promise<boolean> {
  const existing = await prisma.webhookDelivery.findUnique({
    where: { deliveryId },
  });
  return existing != null;
}

/**
 * Record a webhook delivery for idempotency. Throws if deliveryId already exists.
 */
export async function recordDelivery(
  deliveryId: string,
  topic: string,
  shop: string | null
): Promise<void> {
  await prisma.webhookDelivery.create({
    data: { deliveryId, topic, shop },
  });
}

/**
 * Enqueue a job for async processing (app/uninstalled, shop/redact).
 */
export async function enqueueWebhookJob(
  deliveryId: string,
  topic: string,
  shop: string | null,
  payload?: unknown
): Promise<void> {
  await prisma.webhookJob.create({
    data: {
      deliveryId,
      topic,
      shop,
      payload: payload != null ? JSON.stringify(payload) : null,
      status: "pending",
    },
  });
}
