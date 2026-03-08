import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import {
  getDeliveryId,
  fallbackDeliveryKey,
  isDuplicateDelivery,
  recordDelivery,
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

  const pl = payload as { customer?: { id?: number } };
  if (process.env.NODE_ENV !== "test") {
    console.info("[webhook]", {
      topic,
      shop: shop ?? undefined,
      deliveryId: key,
      outcome: "logged",
      customerId: pl?.customer?.id,
    });
  }
  return new Response(null, { status: 200 });
};
