import esbuild from "esbuild";

const prod = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    "node:net",
    "node:http",
    "node:crypto",
    "node:fs",
    "node:os",
    "node:path",
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  define: { DEBUG: prod ? "false" : "true" },
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
});

if (watch) {
  await context.watch();
} else {
  await context.rebuild();
  process.exit(0);
}
