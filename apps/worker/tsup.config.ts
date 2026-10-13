import { defineConfig } from "tsup";

// Workspace packages (@fudo/*) are TypeScript source, so they are bundled in; everything from
// node_modules stays external, and so does the vendored CommonJS Kuma package (it loads its
// provider files from disk at run time).
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  noExternal: [/^@fudo\/(?!kuma-notifications|report-fonts)/],
  // keep "node:" on built-in imports: some exist only with it (node:sqlite for the Uptime Kuma import)
  removeNodeProtocol: false,
});
