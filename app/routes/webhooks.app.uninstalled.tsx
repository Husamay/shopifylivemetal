import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  getDeliveryId,
  fallbackDeliveryKey,
  isDuplicateDelivery,
  recordDelivery,
  enqueueWebhookJob,
} from "../lib/webhook-idempotency.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const deliveryId = getDeliveryId(request);
  if (deliveryId && (await isDuplicateDelivery(deliveryId))) {
    return new Response(null, { status: 200 });
  }

  const { shop, topic, payload } = await authenticate.webhook(request);
  const key = deliveryId ?? fallbackDeliveryKey(topic, shop, payload);
  try {
    await recordDelivery(key, topic, shop);
  } catch (e: unknown) {
    if (e != null && typeof e === "object" && "code" in e && e.code === "P2002") {
      return new Response(null, { status: 200 });
    }
    throw e;
  }

  await enqueueWebhookJob(key, topic, shop, payload);

  if (process.env.NODE_ENV !== "test") {
    console.info("[webhook]", {
      topic,
      shop: shop ?? undefined,
      deliveryId: key,
      outcome: "enqueued",
    });
  }
  return new Response(null, { status: 200 });
};
