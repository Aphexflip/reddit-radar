interface CountRow { count: number; }

export async function researchStatus(env: Env) {
  const datasets = await env.DB.prepare(`
    SELECT id, name, source_type, provider, data_class, quality_class,
           earliest_available_time, latest_available_time, status, updated_at
    FROM research_datasets
    ORDER BY CASE status WHEN 'ready' THEN 0 WHEN 'backfilling' THEN 1 ELSE 2 END,
             name
  `).all();

  const partitionCounts = await env.DB.prepare(`
    SELECT dataset_id,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'complete' THEN 1 ELSE 0 END) AS complete,
           SUM(CASE WHEN status = 'missing' THEN 1 ELSE 0 END) AS missing,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN status = 'retry' THEN 1 ELSE 0 END) AS retrying,
           MIN(CASE WHEN status = 'complete' THEN partition_date END) AS first_complete_date,
           MAX(CASE WHEN status = 'complete' THEN partition_date END) AS last_complete_date
    FROM research_partitions
    GROUP BY dataset_id
  `).all();

  const featureRows = await env.DB.prepare(`SELECT COUNT(*) AS count FROM research_setup_snapshots`).first<CountRow>();
  const labelRows = await env.DB.prepare(`SELECT COUNT(*) AS count FROM research_outcome_labels`).first<CountRow>();
  const backtests = await env.DB.prepare(`SELECT COUNT(*) AS count FROM research_backtests`).first<CountRow>();
  const latestBackfill = await env.DB.prepare(`
    SELECT r.id, r.dataset_id, d.name AS dataset_name, r.started_at, r.completed_at,
           r.partitions_attempted, r.partitions_completed, r.partitions_failed,
           r.rows_written, r.status, r.last_error
    FROM research_backfill_runs r
    JOIN research_datasets d ON d.id = r.dataset_id
    ORDER BY r.started_at DESC
    LIMIT 1
  `).first();
  const latestBacktest = await env.DB.prepare(`
    SELECT id, name, strategy_version, dataset_cutoff_time, leakage_audit_status,
           started_at, completed_at, sample_count, result_metrics_json, status
    FROM research_backtests
    ORDER BY started_at DESC
    LIMIT 1
  `).first();
  const activeFeatureSet = await env.DB.prepare(`
    SELECT id, name, version, created_at
    FROM research_feature_sets
    WHERE active = 1
    ORDER BY created_at DESC
    LIMIT 1
  `).first();

  const coverageByDataset = new Map<string, unknown>();
  for (const row of partitionCounts.results as Array<Record<string, unknown>>) {
    coverageByDataset.set(String(row.dataset_id), row);
  }

  const datasetRows = (datasets.results as Array<Record<string, unknown>>).map((dataset) => ({
    ...dataset,
    coverage: coverageByDataset.get(String(dataset.id)) ?? {
      total: 0,
      complete: 0,
      missing: 0,
      failed: 0,
      retrying: 0,
      first_complete_date: null,
      last_complete_date: null,
    },
  }));

  const completePartitions = datasetRows.reduce((sum, row) => {
    const coverage = row.coverage as Record<string, unknown>;
    return sum + Number(coverage.complete ?? 0);
  }, 0);

  const totalPartitions = datasetRows.reduce((sum, row) => {
    const coverage = row.coverage as Record<string, unknown>;
    return sum + Number(coverage.total ?? 0);
  }, 0);

  let phase = 'B0-foundation';
  if (completePartitions > 0) phase = 'B1-backfill';
  if ((featureRows?.count ?? 0) > 0 && (labelRows?.count ?? 0) > 0) phase = 'B5-evaluation-ready';
  if ((backtests?.count ?? 0) > 0) phase = 'B5-backtesting';

  return {
    track: 'B',
    phase,
    principle: 'Historical research may improve future decisions, but it never rewrites the forward paper ledger.',
    counts: {
      datasets: datasetRows.length,
      partitions_total: totalPartitions,
      partitions_complete: completePartitions,
      setup_snapshots: featureRows?.count ?? 0,
      outcome_labels: labelRows?.count ?? 0,
      backtests: backtests?.count ?? 0,
    },
    active_feature_set: activeFeatureSet,
    latest_backfill: latestBackfill,
    latest_backtest: latestBacktest,
    datasets: datasetRows,
    milestones: [
      { id: 'B0', name: 'Research control plane', status: 'building' },
      { id: 'B1', name: 'Underlying market backfill', status: 'queued' },
      { id: 'B2', name: 'Historical options warehouse', status: 'queued' },
      { id: 'B3', name: 'SEC + earnings event history', status: 'queued' },
      { id: 'B4', name: 'Historical Reddit reconstruction', status: 'queued' },
      { id: 'B5', name: 'Walk-forward backtests', status: 'queued' },
      { id: 'B6', name: 'Historical-neighbor live API', status: 'queued' },
    ],
    warning: 'No historical edge or calibrated probability exists until leakage-audited walk-forward and forward-paper samples are large enough.'
  };
}
