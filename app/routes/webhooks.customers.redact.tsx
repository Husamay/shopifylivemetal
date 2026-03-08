import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const { shop, topic, payload } = await authenticate.webhook(request);

  // This app does not store Shopify customer data, so there is nothing to redact here.
  console.info("[compliance-webhook] customer_redact received", {
    topic,
    shop,
    customerId: (payload as { customer?: { id?: number } })?.customer?.id,
  });

  return new Response(null, { status: 200 });
};
