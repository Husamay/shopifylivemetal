import { describe, it, expect, vi, beforeEach } from "vitest";
import { loader } from "./cron.update-prices";

const mockFindMany = vi.fn();
const mockUpdate = vi.fn();

vi.mock("../db.server", () => ({
  default: {
    appSettings: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("../shopify.server", () => ({
  unauthenticated: { admin: vi.fn() },
}));

describe("cron.update-prices loader", () => {
  const CRON_SECRET = "test-cron-secret";

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = CRON_SECRET;
    mockFindMany.mockResolvedValue([]);
  });

  it("returns 401 when CRON_SECRET is missing or wrong", async () => {
    const req = new Request("http://localhost/cron/update-prices");
    const res = await loader({ request: req } as never);
    expect(res.status).toBe(401);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("queries only premium shops for scheduled updates", async () => {
    const req = new Request(
      `http://localhost/cron/update-prices?secret=${CRON_SECRET}`
    );
    await loader({ request: req } as never);
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const [call] = mockFindMany.mock.calls;
    expect(call[0].where).toMatchObject({ plan: "premium" });
    expect(call[0].where.metalApiKey).toEqual({ not: null });
    expect(call[0].where.priceUpdateSchedule).toEqual({ not: "manual" });
  });

  it("processes zero shops when only free shops exist (no premium in DB)", async () => {
    mockFindMany.mockResolvedValue([]);
    const req = new Request(
      `http://localhost/cron/update-prices?secret=${CRON_SECRET}`
    );
    const res = await loader({ request: req } as never);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.shops).toBe(0);
    expect(data.results).toEqual([]);
  });
});
