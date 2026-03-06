export function resolve(specifier, context, nextResolve) {
  if (specifier === "obsidian") {
    return { url: "obsidian://stub", shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url === "obsidian://stub") {
    return {
      source:
        "export class TFile {} export class MarkdownView {}",
      format: "module",
      shortCircuit: true,
    };
  }
  return nextLoad(url, context);
}
