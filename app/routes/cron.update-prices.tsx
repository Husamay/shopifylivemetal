import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { updateMetalPrices } from "../services/updatePrices.server";

/**
 * Legacy cron endpoint: run metal price updates for all shops that have a Metal API key.
 * Secure with CRON_SECRET (query or header).
 * Prefer /api/execute-task with shop+token per shop (Premium) for per-store automation.
 *
 * Example (external cron, e.g. cron-job.org or host cron):
 *   GET /cron/update-prices?secret=YOUR_CRON_SECRET
 *   or Header: x-cron-secret: YOUR_CRON_SECRET
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const secret =
    new URL(request.url).searchParams.get("secret") ??
    request.headers.get("x-cron-secret") ??
    "";
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || secret !== expected) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const settingsList = await prisma.appSettings.findMany({
    where: {
      plan: "premium",
      metalApiKey: { not: null },
      priceUpdateSchedule: { not: "manual" },
    },
  });

  const results: Array<{
    shop: string;
    updated: number;
    errors: string[];
    error?: string;
    skipped?: string | Array<{ productId: string; reason: string }>;
  }> = [];
  const now = new Date();
  const oneDayMs = 24 * 60 * 60 * 1000;

  for (const settings of settingsList) {
    const apiKey = (settings.metalApiKey ?? "").trim();
    if (!apiKey) continue;

    // daily = run at most once per 24h
    if (settings.priceUpdateSchedule === "daily" && settings.lastPriceUpdateAt) {
      const elapsed = now.getTime() - settings.lastPriceUpdateAt.getTime();
      if (elapsed < oneDayMs) {
        results.push({
          shop: settings.shop,
          updated: 0,
          errors: [],
          skipped: "daily limit (last run < 24h ago)",
        });
        continue;
      }
    }

    try {
      const { admin } = await unauthenticated.admin(settings.shop);
      const markup = parseFloat(settings.markupPercent || "15");
      const { updated, errors, skipped } = await updateMetalPrices(
        admin,
        apiKey,
        Number.isNaN(markup) || markup < 0 ? 15 : markup
      );
      await prisma.appSettings.update({
        where: { shop: settings.shop },
        data: { lastPriceUpdateAt: now },
      });
      results.push({ shop: settings.shop, updated, errors, skipped });
    } catch (e) {
      results.push({
        shop: settings.shop,
        updated: 0,
        errors: [],
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return json({
    ok: true,
    ranAt: new Date().toISOString(),
    shops: results.length,
    results,
  });
};
