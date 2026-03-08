import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const { shop, topic, payload } = await authenticate.webhook(request);

  // This app does not persist Shopify customer records.
  // Keep an audit log so requests can be tracked for 30-day compliance handling.
  console.info("[compliance-webhook] data_request received", {
    topic,
    shop,
    customerId: (payload as { customer?: { id?: number } })?.customer?.id,
    ordersRequested: (payload as { orders_requested?: number[] })?.orders_requested
      ?.length,
  });

  return new Response(null, { status: 200 });
};
