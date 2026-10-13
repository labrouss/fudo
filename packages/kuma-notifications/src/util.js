// Shim for Uptime Kuma's src/util.ts (status constants, links, logging).
const DOWN = 0;
const UP = 1;
const PENDING = 2;
const MAINTENANCE = 3;
// Kuma links to /dashboard/<monitorId>; in Fudo the "monitor" handed to providers is the incident.
const getMonitorRelativeURL = (id) => `/incidents/${id}`;
const log = {
    debug() {}, info() {},
    warn: (module, msg) => console.warn(`[kuma:${module}] ${msg}`),
    error: (module, msg) => console.error(`[kuma:${module}] ${msg}`),
};
module.exports = { DOWN, UP, PENDING, MAINTENANCE, getMonitorRelativeURL, log, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
