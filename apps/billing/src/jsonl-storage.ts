import { mkdir, readFile, appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { BillingStorage, LedgerEvent, LedgerOrder } from "./worker";

// Node-only append-only JSONL ledger for `billing:dev` and self-hosted Node
// deployments. One line per record: {"kind":"event"|"order", ...}.
// Low-volume billing traffic makes an in-memory index loaded from disk
// sufficient; corrupt/partial last lines are skipped.
export class JsonlBillingStorage implements BillingStorage {
  private readonly events = new Set<string>();
  private readonly orders = new Set<string>();
  private loading: Promise<void> | null = null;
  private writes: Promise<unknown> = Promise.resolve();
  private needsNewline = false;

  constructor(private readonly file: string) {}

  private async ready() {
    this.loading ??= this.load().catch((error) => {
      this.loading = null;
      throw error;
    });
    await this.loading;
  }

  private async load() {
    let text = "";
    try {
      text = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return;
    }
    this.needsNewline = text.length > 0 && !text.endsWith("\n");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as
          ({ kind: "event" } & LedgerEvent) | ({ kind: "order" } & LedgerOrder);
        if (record.kind === "event") this.events.add(record.id);
        else if (record.kind === "order") this.orders.add(record.id);
      } catch {
        // Partial trailing write; the next append starts a fresh line.
      }
    }
  }

  private async append(record: unknown) {
    await mkdir(dirname(this.file), { recursive: true, mode: 0o700 });
    const line = `${this.needsNewline ? "\n" : ""}${JSON.stringify(record)}\n`;
    this.needsNewline = true;
    await appendFile(this.file, line, { encoding: "utf8", mode: 0o600 });
    this.needsNewline = false;
  }

  private writeOnce(index: Set<string>, id: string, record: unknown) {
    const write = this.writes.then(async () => {
      await this.ready();
      if (index.has(id)) return;
      await this.append(record);
      index.add(id);
    });
    this.writes = write.catch(() => {});
    return write;
  }

  async hasEvent(id: string) {
    await this.ready();
    return this.events.has(id);
  }
  async putEvent(event: LedgerEvent) {
    await this.writeOnce(this.events, event.id, { kind: "event", ...event });
  }
  async hasOrder(id: string) {
    await this.ready();
    return this.orders.has(id);
  }
  async putOrder(order: LedgerOrder) {
    await this.writeOnce(this.orders, order.id, { kind: "order", ...order });
  }
}
