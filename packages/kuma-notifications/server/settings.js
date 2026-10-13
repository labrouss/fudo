// Shim for Uptime Kuma's server/settings.js (only primaryBaseURL is read by providers).
const ctx = require("../context");
module.exports = {
    Settings: {
        async get(key) { return key === "primaryBaseURL" ? ctx.baseURL : null; },
        async set() {},
    },
};
