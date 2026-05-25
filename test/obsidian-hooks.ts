interface ResolveContext {
  conditions: string[];
  parentURL?: string;
}

interface LoadContext {
  conditions: string[];
  format?: string;
}

type NextResolve = (
  specifier: string,
  context: ResolveContext,
) => { url: string };
type NextLoad = (
  url: string,
  context: LoadContext,
) => { source: string; format: string };

export function resolve(
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve,
) {
  if (specifier === "obsidian") {
    return { url: "obsidian://stub", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export function load(url: string, context: LoadContext, nextLoad: NextLoad) {
  if (url === "obsidian://stub") {
    return {
      source:
        "export class TFile {} export class MarkdownView {} export const activeWindow = { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis), setInterval: globalThis.setInterval.bind(globalThis), clearInterval: globalThis.clearInterval.bind(globalThis) }",
      format: "module",
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
