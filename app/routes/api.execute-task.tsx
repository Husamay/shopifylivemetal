import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";
import prisma from "../db.server";
import { updateMetalPrices } from "../services/updatePrices.server";

const PREMIUM_REQUIRED_MESSAGE =
  "Automated tasks require a Premium subscription.";

/**
 * POST /api/execute-task
 * - With valid Shopify session (embedded app): run price update for that shop.
 * - Without session: require query shop + token; allow only if plan === 'premium' and token matches cronToken.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // 1) Manual: try admin auth (embedded app with session)
  try {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;
    const settings = await prisma.appSettings.findUnique({ where: { shop } });
    if (!settings?.metalApiKey?.trim()) {
      return json(
        {
          ok: false,
          error:
            "Metal Price API key not set. Go to Settings and add your API key.",
        },
        { status: 400 }
      );
    }
    const markup = parseFloat(settings.markupPercent || "15");
    const safeMarkup =
      Number.isNaN(markup) || markup < 0 ? 15 : markup;
    const { updated, errors } = await updateMetalPrices(
      admin,
      settings.metalApiKey,
      safeMarkup
    );
    return json({
      ok: true,
      updated,
      errors: errors.slice(0, 10),
    });
  } catch {
    // Not a valid admin session; treat as external cron request.
  }

  // 2) Cron: require shop + token (query or form body)
  const url = new URL(request.url);
  const shop =
    url.searchParams.get("shop") ??
    (await request.formData().then((f) => f.get("shop") as string | null)) ??
    "";
  const token =
    url.searchParams.get("token") ??
    url.searchParams.get("cronToken") ??
    (await request.formData().then((f) => {
      const t = f.get("token");
      const c = f.get("cronToken");
      return (t ?? c) as string | null;
    })) ??
    "";

  if (!shop.trim() || !token.trim()) {
    return json(
      { error: PREMIUM_REQUIRED_MESSAGE },
      { status: 403 }
    );
  }

  const settings = await prisma.appSettings.findUnique({
    where: { shop: shop.trim() },
  });

  if (
    !settings ||
    settings.plan !== "premium" ||
    settings.cronToken !== token.trim()
  ) {
    return json(
      { error: PREMIUM_REQUIRED_MESSAGE },
      { status: 403 }
    );
  }

  const apiKey = (settings.metalApiKey ?? "").trim();
  if (!apiKey) {
    return json(
      {
        ok: false,
        error: "Metal Price API key not set in Settings.",
      },
      { status: 400 }
    );
  }

  try {
    const { admin } = await unauthenticated.admin(settings.shop);
    const markup = parseFloat(settings.markupPercent || "15");
    const safeMarkup =
      Number.isNaN(markup) || markup < 0 ? 15 : markup;
    const { updated, errors } = await updateMetalPrices(
      admin,
      apiKey,
      safeMarkup
    );
    const now = new Date();
    await prisma.appSettings.update({
      where: { shop: settings.shop },
      data: { lastPriceUpdateAt: now },
    });
    return json({
      ok: true,
      updated,
      errors: errors.slice(0, 10),
    });
  } catch (e) {
    return json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
};
