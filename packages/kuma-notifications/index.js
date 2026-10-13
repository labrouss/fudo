/**
 * Fudo adapter for the vendored Uptime Kuma notification providers.
 * Provider files in server/notification-providers are unmodified upstream code (MIT, see LICENSE);
 * server/settings.js, server/util-server.js and src/util.js are Fudo shims.
 */
const fs = require("fs");
const path = require("path");
const ctx = require("./context");
const catalog = require("./providers.json");

// Kuma's server registers these dayjs plugins globally at start-up; providers rely on them.
const dayjs = require("dayjs");
dayjs.extend(require("dayjs/plugin/utc"));
dayjs.extend(require("dayjs/plugin/timezone"));
dayjs.extend(require("dayjs/plugin/customParseFormat"));

const DIR = path.join(__dirname, "server", "notification-providers");
let instances = null;
const loadErrors = {};

function load() {
    if (instances) return instances;
    instances = new Map();
    const wanted = new Map(catalog.providers.map((p) => [p.file, p.id]));
    for (const file of fs.readdirSync(DIR)) {
        if (!wanted.has(file)) continue;
        try {
            const Cls = require(path.join(DIR, file));
            const inst = new Cls();
            instances.set(inst.name, inst);
        } catch (err) {
            loadErrors[wanted.get(file)] = err.message;
        }
    }
    return instances;
}

/**
 * Sends through one Kuma provider.
 * @param {string} id provider id (Kuma notification "type")
 * @param {object} config the provider's form values
 * @param {string} msg message text
 * @param {object|null} monitorJSON { id, name, url, type, hostname } or null for a test
 * @param {object|null} heartbeatJSON { status: 0|1, msg, time, ... } or null for a test
 * @param {{ baseURL?: string|null }} options
 */
async function send(id, config, msg, monitorJSON, heartbeatJSON, options = {}) {
    const p = load().get(id);
    if (!p) throw new Error(loadErrors[id] ? `Provider ${id} failed to load: ${loadErrors[id]}` : `Unknown provider ${id}`);
    ctx.baseURL = options.baseURL ?? null;
    return p.send({ ...config, type: id }, msg, monitorJSON, heartbeatJSON);
}

module.exports = { catalog, send, load, loadErrors, UP: 1, DOWN: 0 };
