import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { authenticate, PREMIUM_PLAN } from "../shopify.server";
import prisma from "../db.server";

/**
 * Callback after merchant approves or declines billing.
 * Verifies active subscription and sets AppSettings.plan to 'premium' or 'free', then redirects to /app.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const shop = session.shop;

  const { hasActivePayment } = await billing.check({
    plans: [PREMIUM_PLAN],
    isTest: process.env.NODE_ENV !== "production",
  });

  await prisma.appSettings.upsert({
    where: { shop },
    create: { shop, plan: hasActivePayment ? "premium" : "free" },
    update: { plan: hasActivePayment ? "premium" : "free" },
  });

  return redirect(`/app?billing=${hasActivePayment ? "success" : "cancelled"}`);
};
