import initSqlJs, { type Database } from "sql.js";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
  chmodSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import {
  AppError,
  defaultSettings,
  now,
  type Project,
  type Settings,
  type Job,
  type Approval,
} from "./model";

export class Store {
  private constructor(
    public root: string,
    private db: Database,
    private key: Buffer,
  ) {}
  static async open(root: string, wasmPath?: string) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    for (const d of ["media", "exports", "skills"])
      mkdirSync(join(root, d), { recursive: true, mode: 0o700 });
    const SQL = await initSqlJs(
      wasmPath ? { locateFile: () => wasmPath } : undefined,
    );
    const filename = join(root, "studio.sqlite");
    const db = existsSync(filename)
      ? new SQL.Database(readFileSync(filename))
      : new SQL.Database();
    db.run(
      "CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL,id TEXT NOT NULL,json TEXT NOT NULL,PRIMARY KEY(kind,id)); CREATE INDEX IF NOT EXISTS records_kind ON records(kind);",
    );
    const keyPath = join(root, ".vault-key");
    if (!existsSync(keyPath))
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
    const store = new Store(root, db, readFileSync(keyPath));
    store.flush();
    return store;
  }
  flush() {
    const target = join(this.root, "studio.sqlite"),
      tmp = target + ".tmp";
    writeFileSync(tmp, Buffer.from(this.db.export()), { mode: 0o600 });
    renameSync(tmp, target);
  }
  get<T>(kind: string, key: string): T | undefined {
    const query = this.db.prepare(
      "SELECT json FROM records WHERE kind=? AND id=?",
    );
    try {
      query.bind([kind, key]);
      return query.step()
        ? JSON.parse(String(query.getAsObject().json))
        : undefined;
    } finally {
      query.free();
    }
  }
  list<T>(kind: string): T[] {
    const query = this.db.prepare(
      "SELECT json FROM records WHERE kind=? ORDER BY rowid DESC",
    );
    const rows: T[] = [];
    try {
      query.bind([kind]);
      while (query.step())
        rows.push(JSON.parse(String(query.getAsObject().json)));
    } finally {
      query.free();
    }
    return rows;
  }
  put(kind: string, key: string, value: unknown) {
    this.db.run(
      "INSERT INTO records(kind,id,json) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json",
      [kind, key, JSON.stringify(value)],
    );
    this.flush();
    return value;
  }
  writeBatch(
    rows: { kind: string; id: string; value: unknown }[],
    { insertOnly = false }: { insertOnly?: boolean } = {},
  ) {
    if (
      new Set(rows.map(({ kind, id }) => JSON.stringify([kind, id]))).size !==
      rows.length
    )
      throw new Error("Duplicate batch record");
    const values = rows.map(({ kind, id, value }) => [
      kind,
      id,
      JSON.stringify(value),
    ]);
    const previous = insertOnly
      ? []
      : rows.map(({ kind, id }) => this.get(kind, id));
    const insert = "INSERT INTO records(kind,id,json) VALUES(?,?,?)";
    const upsert =
      insert + " ON CONFLICT(kind,id) DO UPDATE SET json=excluded.json";
    this.db.run("BEGIN");
    try {
      for (const row of values) this.db.run(insertOnly ? insert : upsert, row);
      this.db.run("COMMIT");
    } catch (error) {
      this.db.run("ROLLBACK");
      throw error;
    }
    try {
      this.flush();
    } catch (error) {
      // flush publishes a single SQLite image with an atomic rename. Revert
      // in-memory rows to their previous values if publication fails.
      for (const [index, { kind, id }] of rows.entries()) {
        const old = previous[index];
        if (old === undefined)
          this.db.run("DELETE FROM records WHERE kind=? AND id=?", [kind, id]);
        else this.db.run(upsert, [kind, id, JSON.stringify(old)]);
      }
      throw error;
    }
  }
  delete(kind: string, key: string) {
    this.db.run("DELETE FROM records WHERE kind=? AND id=?", [kind, key]);
    this.flush();
  }
  project(key: string): Project {
    const p = this.get<Project>("project", key);
    if (!p) throw new AppError(404, "项目不存在");
    return p;
  }
  mutate(key: string, fn: (p: Project) => void, expectedRevision?: number) {
    const p = this.project(key);
    if (expectedRevision !== undefined && p.revision !== expectedRevision)
      throw new AppError(409, "项目已更新，请刷新后重试，避免覆盖其他修改");
    fn(p);
    p.revision++;
    p.updatedAt = now();
    this.put("project", key, p);
    return p;
  }
  projects() {
    return this.list<Project>("project").sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  jobs() {
    return this.list<Job>("job");
  }
  approvals() {
    return this.list<Approval>("approval");
  }
  encrypt(text: string) {
    if (!text) return "";
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([c.update(text, "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), encrypted]).toString("base64");
  }
  decrypt(text: string) {
    if (!text) return "";
    try {
      const b = Buffer.from(text, "base64"),
        d = createDecipheriv("aes-256-gcm", this.key, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString();
    } catch {
      throw new AppError(500, "无法解密本机凭据，请在设置中重新保存");
    }
  }
  settings(): Settings {
    const s = this.get<Settings>("settings", "main");
    if (!s) return structuredClone(defaultSettings);
    return {
      ...s,
      image: {
        ...defaultSettings.image,
        ...s.image,
        apiKey: this.decrypt(s.image?.apiKey ?? ""),
      },
      transcription: {
        ...defaultSettings.transcription,
        ...s.transcription,
        apiKey: this.decrypt(s.transcription?.apiKey ?? ""),
      },
      speech: {
        ...defaultSettings.speech,
        ...s.speech,
        apiKey: this.decrypt(s.speech?.apiKey ?? ""),
      },
      generation: {
        ...s.generation,
        apiKey: this.decrypt(s.generation.apiKey),
      },
      agent: { ...s.agent, apiKey: this.decrypt(s.agent.apiKey) },
      pricing: { ...defaultSettings.pricing, ...s.pricing },
    };
  }
  saveSettings(s: Settings) {
    const saved = {
      ...s,
      image: { ...s.image, apiKey: this.encrypt(s.image.apiKey) },
      transcription: {
        ...s.transcription,
        apiKey: this.encrypt(s.transcription.apiKey),
      },
      speech: { ...s.speech, apiKey: this.encrypt(s.speech.apiKey) },
      generation: {
        ...s.generation,
        apiKey: this.encrypt(s.generation.apiKey),
      },
      agent: { ...s.agent, apiKey: this.encrypt(s.agent.apiKey) },
    };
    this.put("settings", "main", saved);
  }
  publicSettings() {
    const s = this.settings();
    return {
      ...s,
      image: { ...s.image, apiKey: undefined, hasApiKey: !!s.image.apiKey },
      transcription: {
        ...s.transcription,
        apiKey: undefined,
        hasApiKey: !!s.transcription.apiKey,
      },
      speech: { ...s.speech, apiKey: undefined, hasApiKey: !!s.speech.apiKey },
      generation: {
        ...s.generation,
        apiKey: undefined,
        hasApiKey: !!s.generation.apiKey,
      },
      agent: { ...s.agent, apiKey: undefined, hasApiKey: !!s.agent.apiKey },
    };
  }
  path(relative: string) {
    const target = resolve(this.root, relative);
    if (!target.startsWith(resolve(this.root) + sep))
      throw new AppError(400, "无效文件路径");
    return target;
  }
  backup(destination: string) {
    copyFileSync(join(this.root, "studio.sqlite"), destination);
    chmodSync(destination, 0o600);
  }
  close() {
    this.flush();
    this.db.close();
  }
}
