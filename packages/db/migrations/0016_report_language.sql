-- 0016: language of a scheduled report (NULL = the organisation's default, setting 'notify.locale').
ALTER TABLE report_schedules ADD COLUMN locale text;
