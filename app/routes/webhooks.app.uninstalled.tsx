import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  await authenticate.webhook(request);
  const shop = request.headers.get("X-Shopify-Shop-Domain");
  if (shop) await prisma.appSettings.deleteMany({ where: { shop } });
  return new Response(null, { status: 200 });
};
