-- 0015: language of notifications per channel (NULL = the organisation's default, setting 'notify.locale').
ALTER TABLE notification_channels ADD COLUMN locale text;
