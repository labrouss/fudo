# Maintenance windows

Plan work so it does not page anyone and does not count against availability.

**Maintenance › Schedule maintenance**: give it a title, start and end, notes (change request,
contact, rollback plan) and what it **covers**: assets (with their checks) and monitors.

During the window:

- checks keep running, so you see what happens,
- their results are **excluded from availability** and SLA,
- **alerts are suppressed**,
- items that depend on something in maintenance show it as the cause (*Impacted by
  maintenance*), so nobody chases a planned outage.

**End now** finishes a window early. Windows show as *Scheduled*, *In progress* or *Completed*.

Tip: use **What if this fails?** on the asset first to see which applications the work will
touch.

## Recurring maintenance

Choose **Repeat** when scheduling: every day, every week on chosen days, or every month, on a day
(day 31 falls on the last day of shorter months) or on a weekday of a week (*Tuesday of the second
week* is Microsoft's Patch Tuesday). Times are in the chosen time zone, so 02:00 stays 02:00 across
daylight-saving changes; an end time earlier than the start means the next day.

Fudo creates the windows of the next 60 days, marked **Repeats**. **Skip** removes one occurrence,
and editing a window changes that occurrence only. Editing the series changes its future windows;
deleting it removes them, while past and running windows stay.
