const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const JSON_DB_PATH = process.env.V2_JSON_DB_PATH || path.join(__dirname, "..", "..", "data", "v2-db.json");
const DATABASE_URL = process.env.DATABASE_URL || "";

const defaultShape = {
  cases: [],
  runs: [],
  monitoring: [],
};

class JsonStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.ensureDb();
  }

  ensureDb() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, JSON.stringify(defaultShape, null, 2));
    }
  }

  async load() {
    this.ensureDb();
    const raw = await fs.promises.readFile(this.filePath, "utf8");
    return JSON.parse(raw || "{}");
  }

  async save(data) {
    await fs.promises.writeFile(this.filePath, JSON.stringify(data, null, 2));
  }

  async createCase(payload) {
    const db = await this.load();
    const record = {
      id: randomUUID(),
      name: payload.name || "",
      projectType: payload.projectType || "",
      modeDefaults: payload.modeDefaults || { primary: "PRE_EIA" },
      location: payload.location || null,
      boundaryGeoJSON: payload.boundaryGeoJSON || null,
      metadata: payload.metadata || {},
      claims: payload.claims || "",
      specs: payload.specs || "",
      documents: payload.documents || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.cases.push(record);
    await this.save(db);
    return record;
  }

  async updateCase(id, patch) {
    const db = await this.load();
    const idx = db.cases.findIndex((item) => item.id === id);
    if (idx === -1) {
      return null;
    }
    db.cases[idx] = {
      ...db.cases[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.save(db);
    return db.cases[idx];
  }

  async getCase(id) {
    const db = await this.load();
    return db.cases.find((item) => item.id === id) || null;
  }

  async listCases() {
    const db = await this.load();
    return db.cases;
  }

  async createRun(payload) {
    const db = await this.load();
    const record = {
      id: randomUUID(),
      caseId: payload.caseId,
      mode: payload.mode,
      status: payload.status || "completed",
      startedAt: payload.startedAt || new Date().toISOString(),
      finishedAt: payload.finishedAt || new Date().toISOString(),
      durationMs: payload.durationMs || 0,
      executiveResult: payload.executiveResult || null,
      evidencePack: payload.evidencePack || null,
      roadmap: payload.roadmap || null,
      kpis: payload.kpis || null,
      logs: payload.logs || [],
      caseSnapshot: payload.caseSnapshot || null,
      createdAt: new Date().toISOString(),
    };
    db.runs.push(record);
    await this.save(db);
    return record;
  }

  async getRun(id) {
    const db = await this.load();
    return db.runs.find((item) => item.id === id) || null;
  }

  async listRunsByCase(caseId) {
    const db = await this.load();
    return db.runs.filter((item) => item.caseId === caseId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async setMonitoring(caseId, config) {
    const db = await this.load();
    const idx = db.monitoring.findIndex((item) => item.caseId === caseId);
    const record = {
      caseId,
      enabled: Boolean(config.enabled),
      frequency: config.frequency || "weekly",
      thresholdDeltaIcet: Number.isFinite(config.thresholdDeltaIcet) ? config.thresholdDeltaIcet : 8,
      updatedAt: new Date().toISOString(),
      nextRunAt: config.nextRunAt || null,
      lastRunAt: config.lastRunAt || null,
    };

    if (idx === -1) {
      db.monitoring.push(record);
    } else {
      db.monitoring[idx] = {
        ...db.monitoring[idx],
        ...record,
      };
    }

    await this.save(db);
    return record;
  }

  async getMonitoring(caseId) {
    const db = await this.load();
    return db.monitoring.find((item) => item.caseId === caseId) || null;
  }

  async listMonitoring() {
    const db = await this.load();
    return db.monitoring;
  }
}

class PostgresStore {
  constructor(pool) {
    this.pool = pool;
  }

  static async create() {
    let pg = null;
    try {
      // Optional dependency in dev, expected in production.
      // eslint-disable-next-line global-require
      pg = require("pg");
    } catch (error) {
      throw new Error("pg package is not installed.");
    }

    const pool = new pg.Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.PGSSL === "false" ? false : { rejectUnauthorized: false },
    });

    const store = new PostgresStore(pool);
    await store.migrate();
    return store;
  }

  async migrate() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS v2_cases (
        id UUID PRIMARY KEY,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS v2_runs (
        id UUID PRIMARY KEY,
        case_id UUID NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS v2_monitoring (
        case_id UUID PRIMARY KEY,
        payload JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  async createCase(payload) {
    const id = randomUUID();
    const record = {
      id,
      name: payload.name || "",
      projectType: payload.projectType || "",
      modeDefaults: payload.modeDefaults || { primary: "PRE_EIA" },
      location: payload.location || null,
      boundaryGeoJSON: payload.boundaryGeoJSON || null,
      metadata: payload.metadata || {},
      claims: payload.claims || "",
      specs: payload.specs || "",
      documents: payload.documents || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.pool.query("INSERT INTO v2_cases(id, payload) VALUES($1, $2::jsonb)", [id, JSON.stringify(record)]);
    return record;
  }

  async updateCase(id, patch) {
    const current = await this.getCase(id);
    if (!current) {
      return null;
    }
    const updated = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.pool.query("UPDATE v2_cases SET payload=$2::jsonb, updated_at=now() WHERE id=$1", [id, JSON.stringify(updated)]);
    return updated;
  }

  async getCase(id) {
    const result = await this.pool.query("SELECT payload FROM v2_cases WHERE id=$1", [id]);
    return result.rows[0]?.payload || null;
  }

  async listCases() {
    const result = await this.pool.query("SELECT payload FROM v2_cases ORDER BY created_at DESC");
    return result.rows.map((row) => row.payload);
  }

  async createRun(payload) {
    const id = randomUUID();
    const record = {
      id,
      caseId: payload.caseId,
      mode: payload.mode,
      status: payload.status || "completed",
      startedAt: payload.startedAt || new Date().toISOString(),
      finishedAt: payload.finishedAt || new Date().toISOString(),
      durationMs: payload.durationMs || 0,
      executiveResult: payload.executiveResult || null,
      evidencePack: payload.evidencePack || null,
      roadmap: payload.roadmap || null,
      kpis: payload.kpis || null,
      logs: payload.logs || [],
      caseSnapshot: payload.caseSnapshot || null,
      createdAt: new Date().toISOString(),
    };

    await this.pool.query("INSERT INTO v2_runs(id, case_id, payload) VALUES($1, $2, $3::jsonb)", [id, record.caseId, JSON.stringify(record)]);
    return record;
  }

  async getRun(id) {
    const result = await this.pool.query("SELECT payload FROM v2_runs WHERE id=$1", [id]);
    return result.rows[0]?.payload || null;
  }

  async listRunsByCase(caseId) {
    const result = await this.pool.query("SELECT payload FROM v2_runs WHERE case_id=$1 ORDER BY created_at DESC", [caseId]);
    return result.rows.map((row) => row.payload);
  }

  async setMonitoring(caseId, config) {
    const record = {
      caseId,
      enabled: Boolean(config.enabled),
      frequency: config.frequency || "weekly",
      thresholdDeltaIcet: Number.isFinite(config.thresholdDeltaIcet) ? config.thresholdDeltaIcet : 8,
      updatedAt: new Date().toISOString(),
      nextRunAt: config.nextRunAt || null,
      lastRunAt: config.lastRunAt || null,
    };

    await this.pool.query(
      `INSERT INTO v2_monitoring(case_id, payload) VALUES($1, $2::jsonb)
       ON CONFLICT (case_id) DO UPDATE SET payload=$2::jsonb, updated_at=now()`,
      [caseId, JSON.stringify(record)]
    );
    return record;
  }

  async getMonitoring(caseId) {
    const result = await this.pool.query("SELECT payload FROM v2_monitoring WHERE case_id=$1", [caseId]);
    return result.rows[0]?.payload || null;
  }

  async listMonitoring() {
    const result = await this.pool.query("SELECT payload FROM v2_monitoring ORDER BY updated_at DESC");
    return result.rows.map((row) => row.payload);
  }
}

let singleton = null;

const createStore = async () => {
  if (!DATABASE_URL) {
    return new JsonStore(JSON_DB_PATH);
  }

  try {
    return await PostgresStore.create();
  } catch (error) {
    console.warn(`Postgres adapter unavailable (${error.message}). Falling back to JSON store.`);
    return new JsonStore(JSON_DB_PATH);
  }
};

const getStore = async () => {
  if (singleton) {
    return singleton;
  }
  singleton = await createStore();
  return singleton;
};

module.exports = {
  getStore,
};
