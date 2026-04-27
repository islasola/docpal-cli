# DocPal

DocPal manages Feishu↔Docusaurus documentation pipelines from Claude Code. Author docs in Feishu, organize them into manuals, translate with Claude, and publish to GitHub — all from your terminal or inside a Claude Code conversation.

## Packages

| Package | Purpose | Install |
|---|---|---|
| [`@islasola/docpal-cli`](./packages/cli) | CLI tool | `npm install -g @islasola/docpal-cli` |
| [`@islasola/docpal-plugin`](./packages/plugin) | Claude Code plugin | Marketplace or `npm install @islasola/docpal-plugin` |
| [`@islasola/docpal-skills`](./packages/skills) | Reusable AI skills | `npx skills add islasola/docpal-cli` or `npm install @islasola/docpal-skills` |

## Quick Start

```bash
# Install the CLI
npm install -g @islasola/docpal-cli

# Set up your Feishu app credentials, GitHub token, and first manual
docpal init
docpal manual create --name "API Docs" --root-type wiki --root <wiki-space-id>

# Push a draft from markdown
docpal draft create ./guide.md --parent <wiki-node> --manual "API Docs"

# Approve and publish
docpal manual approve --manual "API Docs" --all
docpal manual publish --manual "API Docs" --target docs-site
```

## Documentation Workflows

- **`docpal-onboard`** — first-time setup (Feishu app, OAuth, bitable init)
- **`docpal-manual`** — manual lifecycle: create → register → approve → publish → release
- **`docpal-draft`** — author technical docs from reference material and push to Feishu
- **`docpal-translate`** — translate Feishu docs using Claude, validate glossary, push via draft
- **`docpal-sync`** — backsync merged GitHub PRs into Feishu

## Repository

- Monorepo: pnpm workspaces + changesets + turbo
- CI: GitHub Actions runs tests on every PR/push
- Release: changesets opens a release PR; merging auto-publishes to npm
