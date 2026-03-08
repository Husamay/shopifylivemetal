import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import prisma from "../db.server";

const MAX_JOBS_PER_RUN = 50;
const PROCESSABLE_TOPICS = ["app/uninstalled", "shop/redact"] as const;

/**
 * Worker endpoint: process enqueued webhook jobs (app/uninstalled, shop/redact).
 * Secure with CRON_SECRET. Run via external cron (e.g. every 1–5 min).
 *
 * GET /cron/process-webhooks?secret=YOUR_CRON_SECRET
 * or Header: x-cron-secret: YOUR_CRON_SECRET
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

  const pending = await prisma.webhookJob.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: MAX_JOBS_PER_RUN,
  });

  const results: Array<{ id: string; topic: string; shop: string | null; status: string; error?: string }> = [];

  for (const job of pending) {
    if (!PROCESSABLE_TOPICS.includes(job.topic as (typeof PROCESSABLE_TOPICS)[number])) {
      await prisma.webhookJob.update({
        where: { id: job.id },
        data: { status: "processed", processedAt: new Date() },
      });
      results.push({ id: job.id, topic: job.topic, shop: job.shop, status: "skipped" });
      continue;
    }

    try {
      const shop = job.shop;
      if (shop) {
        await prisma.$transaction([
          prisma.appSettings.deleteMany({ where: { shop } }),
          prisma.session.deleteMany({ where: { shop } }),
        ]);
      }
      await prisma.webhookJob.update({
        where: { id: job.id },
        data: { status: "processed", processedAt: new Date() },
      });
      results.push({ id: job.id, topic: job.topic, shop: job.shop, status: "processed" });
    } catch (e) {
      await prisma.webhookJob.update({
        where: { id: job.id },
        data: { status: "failed", processedAt: new Date() },
      });
      results.push({
        id: job.id,
        topic: job.topic,
        shop: job.shop,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return json({
    ok: true,
    ranAt: new Date().toISOString(),
    processed: results.length,
    results,
  });
};
