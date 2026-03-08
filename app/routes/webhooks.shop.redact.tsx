import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const { shop, topic } = await authenticate.webhook(request);

  if (shop) {
    await prisma.$transaction([
      prisma.appSettings.deleteMany({ where: { shop } }),
      prisma.session.deleteMany({ where: { shop } }),
    ]);
  }

  console.info("[compliance-webhook] shop_redact received", { topic, shop });

  return new Response(null, { status: 200 });
};
