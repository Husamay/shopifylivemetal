import { describe, it, expect, vi, beforeEach } from "vitest";
import { action } from "./api.execute-task";

const mockFindUnique = vi.fn();

vi.mock("../db.server", () => ({
  default: {
    appSettings: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: vi.fn(),
    },
  },
}));

vi.mock("../shopify.server", () => ({
  authenticate: { admin: vi.fn().mockRejectedValue(new Error("no session")) },
  unauthenticated: { admin: vi.fn() },
}));

vi.mock("../services/updatePrices.server", () => ({
  updateMetalPrices: vi.fn().mockResolvedValue({ updated: 0, errors: [] }),
}));

describe("api.execute-task action (cron path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when shop has free plan and cron token is used", async () => {
    mockFindUnique.mockResolvedValue({
      shop: "free-shop.myshopify.com",
      plan: "free",
      cronToken: "some-token",
      metalApiKey: "key",
      markupPercent: "15",
    });
    const req = new Request(
      "http://localhost/api/execute-task?shop=free-shop.myshopify.com&token=some-token",
      { method: "POST" }
    );
    const res = await action({ request: req } as never);
    const data = await res.json();
    expect(res.status).toBe(403);
    expect(data.error).toBe(
      "Automated tasks require a Premium subscription."
    );
  });

  it("returns 403 when shop is not found (no settings)", async () => {
    mockFindUnique.mockResolvedValue(null);
    const req = new Request(
      "http://localhost/api/execute-task?shop=unknown.myshopify.com&token=any",
      { method: "POST" }
    );
    const res = await action({ request: req } as never);
    expect(res.status).toBe(403);
  });
});
