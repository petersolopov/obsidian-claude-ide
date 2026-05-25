import { register } from "node:module";

(globalThis as Record<string, unknown>).DEBUG = Boolean(process.env.DEBUG);
(globalThis as Record<string, unknown>).activeWindow = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
};

register("./obsidian-hooks.ts", import.meta.url);
