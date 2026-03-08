import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate, PREMIUM_PLAN } from "../shopify.server";

/**
 * Initiates Shopify recurring billing for the Premium Plan.
 * Redirects to Shopify's confirmation URL; after approval, merchant returns to /api/billing/callback.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { billing } = await authenticate.admin(request);
  const url = new URL(request.url);
  const appUrl = process.env.SHOPIFY_APP_URL || url.origin;
  const returnUrl = `${appUrl}/api/billing/callback`;
  await billing.request({
    plan: PREMIUM_PLAN,
    returnUrl,
    isTest: process.env.NODE_ENV !== "production",
  });
};
