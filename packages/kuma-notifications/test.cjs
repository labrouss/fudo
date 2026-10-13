// Every catalogued provider must load with the shims and installed dependencies.
const k = require("./index.js");
const loaded = k.load();
const missing = k.catalog.providers.filter((p) => !loaded.has(p.id)).map((p) => `${p.id}: ${k.loadErrors[p.id] ?? "name mismatch"}`);
console.log(`${loaded.size}/${k.catalog.providers.length} providers loaded`);
if (missing.length) { console.error(missing.join("\n")); process.exit(1); }
