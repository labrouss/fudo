-- 0023: indexes for data retention (old rows are found by time and deleted in batches).
CREATE INDEX IF NOT EXISTS notification_deliveries_created_idx ON notification_deliveries (created_at);
CREATE INDEX IF NOT EXISTS oncall_sends_sent_idx ON oncall_sends (sent_at);
CREATE INDEX IF NOT EXISTS incidents_resolved_idx ON incidents (resolved_at) WHERE status = 'resolved';
CREATE INDEX IF NOT EXISTS maintenance_windows_ends_idx ON maintenance_windows (ends_at);
CREATE INDEX IF NOT EXISTS state_changes_ts_idx ON state_changes (ts);
