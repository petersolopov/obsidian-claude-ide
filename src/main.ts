import { Plugin } from "obsidian";

export default class ObsidianClaudeBridge extends Plugin {
  async onload() {
    console.log("obsidian-claude-bridge: loaded");
  }

  onunload() {
    console.log("obsidian-claude-bridge: unloaded");
  }
}
