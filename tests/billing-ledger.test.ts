import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JsonlBillingStorage } from "../apps/billing/src/jsonl-storage";
import type { LedgerEvent, LedgerOrder } from "../apps/billing/src/worker";

const event: LedgerEvent = {
  id: "evt_1",
  type: "checkout.completed",
  receivedAt: "2026-11-06T03:00:00.000Z",
};
const order: LedgerOrder = {
  id: "ord_1",
  eventId: "evt_1",
  productId: "prod_jingxu",
  customerEmail: "buyer@example.com",
  status: "paid",
  amountPaid: 9900,
  currency: "CNY",
  keys: [
    {
      id: "lk_1",
      maskedKey: "••••-UVWXY",
      status: "inactive",
      activationLimit: 1,
      expiresAt: null,
    },
  ],
  createdAt: "2026-11-06T03:00:00.000Z",
  recordedAt: "2026-11-06T03:00:01.000Z",
};

describe("JSONL 账单台账", () => {
  it("追加落盘，重启实例后幂等索引仍在", async () => {
    const dir = await mkdtemp(join(tmpdir(), "jingxu-ledger-"));
    const file = join(dir, "nested", "billing-ledger.jsonl");
    try {
      const first = new JsonlBillingStorage(file);
      expect(await first.hasEvent("evt_1")).toBe(false);
      await Promise.all([first.putOrder(order), first.putOrder(order)]);
      await first.putEvent(event);
      expect(await first.hasOrder("ord_1")).toBe(true);
      expect(await first.hasEvent("evt_1")).toBe(true);

      // Repeated writes are deduplicated in memory.
      await first.putOrder(order);
      await first.putEvent(event);

      // Simulate process restart: a fresh instance re-indexes the file.
      const restarted = new JsonlBillingStorage(file);
      expect(await restarted.hasEvent("evt_1")).toBe(true);
      expect(await restarted.hasOrder("ord_1")).toBe(true);
      expect(await restarted.hasEvent("evt_missing")).toBe(false);

      const lines = (await readFile(file, "utf8")).trim().split("\n");
      expect(lines).toHaveLength(2);
      if (process.platform !== "win32")
        expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(lines[0]!)).toMatchObject({
        kind: "order",
        id: "ord_1",
      });
      expect(JSON.parse(lines[1]!)).toMatchObject({
        kind: "event",
        id: "evt_1",
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
