-- 0007: escalation. A channel with escalate_after_minutes > 0 is an escalation step: it is only
-- notified when an incident is still open (not acknowledged, not snoozed) that long after opening.
ALTER TABLE notification_channels
  ADD COLUMN escalate_after_minutes integer NOT NULL DEFAULT 0 CHECK (escalate_after_minutes >= 0 AND escalate_after_minutes <= 10080);
CREATE INDEX notification_deliveries_escalation_idx ON notification_deliveries (incident_id, channel_id) WHERE event = 'escalated';
