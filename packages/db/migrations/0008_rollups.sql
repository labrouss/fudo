-- 0008: TimescaleDB rollups for charts and long-range uptime (F-501).
-- Everything here is optional: without TimescaleDB the API computes charts from raw results.
DO $outer$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    RAISE NOTICE 'TimescaleDB not installed: charts are computed from raw check results';
    RETURN;
  END IF;

  -- Hourly rollup with real-time aggregation (queries also see the not-yet-materialized last hour).
  BEGIN
    EXECUTE $q$
      CREATE MATERIALIZED VIEW check_results_hourly WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
      SELECT time_bucket('1 hour', ts) AS bucket, monitor_id,
             count(*) AS total,
             count(*) FILTER (WHERE in_maintenance) AS maint,
             count(*) FILTER (WHERE status = 'DOWN' AND NOT in_maintenance) AS down,
             count(*) FILTER (WHERE status = 'DEGRADED' AND NOT in_maintenance) AS degraded,
             sum(latency_ms) AS sum_ms, count(latency_ms) AS n_ms, max(latency_ms) AS max_ms,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_ms
        FROM check_results GROUP BY 1, 2 WITH NO DATA $q$;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'percentile in continuous aggregates not supported here (%); p95 falls back to max', SQLERRM;
    EXECUTE $q$
      CREATE MATERIALIZED VIEW check_results_hourly WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
      SELECT time_bucket('1 hour', ts) AS bucket, monitor_id,
             count(*) AS total,
             count(*) FILTER (WHERE in_maintenance) AS maint,
             count(*) FILTER (WHERE status = 'DOWN' AND NOT in_maintenance) AS down,
             count(*) FILTER (WHERE status = 'DEGRADED' AND NOT in_maintenance) AS degraded,
             sum(latency_ms) AS sum_ms, count(latency_ms) AS n_ms, max(latency_ms) AS max_ms, max(latency_ms) AS p95_ms
        FROM check_results GROUP BY 1, 2 WITH NO DATA $q$;
  END;

  -- Daily rollup built on the hourly one (hierarchical continuous aggregate); p95 = worst hourly p95.
  EXECUTE $q$
    CREATE MATERIALIZED VIEW check_results_daily WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
    SELECT time_bucket('1 day', bucket) AS bucket, monitor_id,
           sum(total) AS total, sum(maint) AS maint, sum(down) AS down, sum(degraded) AS degraded,
           sum(sum_ms) AS sum_ms, sum(n_ms) AS n_ms, max(max_ms) AS max_ms, max(p95_ms) AS p95_ms
      FROM check_results_hourly GROUP BY 1, 2 WITH NO DATA $q$;

  PERFORM add_continuous_aggregate_policy('check_results_hourly', start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour', schedule_interval => INTERVAL '30 minutes');
  PERFORM add_continuous_aggregate_policy('check_results_daily', start_offset => INTERVAL '40 days', end_offset => INTERVAL '1 day', schedule_interval => INTERVAL '6 hours');

  -- Keep hourly detail for ~13 months; daily rollups are kept indefinitely. Raw results: 30 days (0004).
  PERFORM add_retention_policy('check_results_hourly', INTERVAL '400 days');

  -- Compress raw results older than 3 days (typically ~90% smaller).
  ALTER TABLE check_results SET (timescaledb.compress, timescaledb.compress_segmentby = 'monitor_id', timescaledb.compress_orderby = 'ts DESC');
  PERFORM add_compression_policy('check_results', INTERVAL '3 days');
END $outer$;
