# @islasola/docpal-plugin

Claude Code plugin for DocPal documentation workflows.

## Install

### From Claude Code Marketplace

```
/plugin marketplace add islasola/docpal-cli
```

### From npm

```bash
npm install @islasola/docpal-plugin
```

## Skills

Once installed, the plugin provides 5 workflow skills:

- **`docpal-onboard`** — first-time setup of DocPal + Feishu credentials
- **`docpal-manual`** — create, register, approve, publish, and release manuals
- **`docpal-draft`** — author technical docs and push to Feishu
- **`docpal-translate`** — translate docs using Claude and validate glossary terms
- **`docpal-sync`** — backsync merged GitHub PRs into Feishu

Invoke any skill with `/docpal:<skill-name>` in Claude Code.

## Repository

https://github.com/islasola/docpal-cli
