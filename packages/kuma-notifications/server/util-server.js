// Shim for Uptime Kuma's server/util-server.js
const { Settings } = require("./settings");
module.exports = {
    setting: (key) => Settings.get(key),
    setSettings: async () => {},
};
