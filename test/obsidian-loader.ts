import { register } from "node:module";

(globalThis as Record<string, unknown>).DEBUG = Boolean(process.env.DEBUG);

register("./obsidian-hooks.ts", import.meta.url);
