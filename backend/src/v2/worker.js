const { getStore } = require("./persistence/store");
const { runCaseAnalysis } = require("./orchestrator/runOrchestrator");

const POLL_MS = Number(process.env.MONITORING_POLL_MS || 60_000);

const addInterval = (date, frequency) => {
  const next = new Date(date.getTime());
  if (frequency === "daily") {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (frequency === "hourly") {
    next.setUTCHours(next.getUTCHours() + 1);
    return next;
  }
  next.setUTCDate(next.getUTCDate() + 7);
  return next;
};

const shouldRun = (monitoring) => {
  if (!monitoring?.enabled) {
    return false;
  }
  if (!monitoring.nextRunAt) {
    return true;
  }
  return Date.now() >= new Date(monitoring.nextRunAt).getTime();
};

const runSchedulerTick = async () => {
  const store = await getStore();
  const monitoringList = await store.listMonitoring();

  for (const monitoring of monitoringList) {
    if (!shouldRun(monitoring)) {
      continue;
    }

    const caseData = await store.getCase(monitoring.caseId);
    if (!caseData) {
      continue;
    }

    const startedAt = Date.now();
    const analysis = await runCaseAnalysis({
      caseData,
      mode: "LIVING_EIA",
      monitoringContext: { frequency: monitoring.frequency },
    });

    const finishedAt = Date.now();

    await store.createRun({
      caseId: caseData.id,
      mode: analysis.mode,
      status: "completed",
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAt).toISOString(),
      durationMs: finishedAt - startedAt,
      executiveResult: analysis.executiveResult,
      evidencePack: analysis.evidencePack,
      roadmap: analysis.roadmap,
      kpis: analysis.kpis,
      logs: analysis.logs,
      caseSnapshot: {
        id: caseData.id,
        name: caseData.name,
        location: caseData.location,
        boundaryGeoJSON: caseData.boundaryGeoJSON,
      },
    });

    const nextRun = addInterval(new Date(), monitoring.frequency || "weekly");
    await store.setMonitoring(caseData.id, {
      ...monitoring,
      enabled: true,
      lastRunAt: new Date().toISOString(),
      nextRunAt: nextRun.toISOString(),
    });

    console.log(`Monitoring run completed for case ${caseData.id}`);
  }
};

const bootstrap = async () => {
  console.log(`Living EIA worker started. Poll every ${POLL_MS}ms`);
  await runSchedulerTick();
  setInterval(() => {
    runSchedulerTick().catch((error) => {
      console.error("Worker tick failed", error);
    });
  }, POLL_MS);
};

bootstrap().catch((error) => {
  console.error("Worker bootstrap failed", error);
  process.exit(1);
});
