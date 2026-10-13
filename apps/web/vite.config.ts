import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// version and repository from the root package.json: shown under Help (AGPL: users can get the source)
const root = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string; repository?: { url?: string } | string };
const repo = (typeof root.repository === "string" ? root.repository : root.repository?.url ?? "").replace(/^git\+/, "").replace(/\.git$/, "");

export default defineConfig({
  plugins: [react()],
  define: { __FUDO_VERSION__: JSON.stringify(root.version), __FUDO_SOURCE__: JSON.stringify(repo) },
  server: {
    port: 5173,
    // locales/en.json lives at the repository root
    fs: { allow: ["..", "../.."] },
    proxy: { "^/api/.*": process.env.API_URL ?? "http://localhost:3000" },
  },
});
