const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const DB_PATH = path.join(__dirname, "..", "data", "db.json");

const defaultData = {
  projects: [],
  audits: [],
};

const ensureDb = () => {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2));
  }
};

const loadDb = () => {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw);
};

const saveDb = (data) => {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

const createProject = (payload) => {
  const db = loadDb();
  const project = {
    id: randomUUID(),
    name: payload.name || "",
    industry: payload.industry || "",
    scenario: payload.scenario || "",
    coordinates: payload.coordinates || null,
    claims: payload.claims || "",
    specs: payload.specs || "",
    file: payload.file || null,
    createdAt: new Date().toISOString(),
  };
  db.projects.push(project);
  saveDb(db);
  return project;
};

const listProjects = () => loadDb().projects;

const getProject = (id) => loadDb().projects.find((project) => project.id === id) || null;

const createAudit = (payload) => {
  const db = loadDb();
  const audit = {
    id: randomUUID(),
    projectId: payload.projectId || null,
    analysis: payload.analysis,
    logs: payload.logs || [],
    createdAt: new Date().toISOString(),
  };
  db.audits.push(audit);
  saveDb(db);
  return audit;
};

const getAudit = (id) => loadDb().audits.find((audit) => audit.id === id) || null;

module.exports = {
  createProject,
  listProjects,
  getProject,
  createAudit,
  getAudit,
};
