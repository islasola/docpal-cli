# @islasola/docpal-cli

CLI tool for managing Feishu↔Docusaurus documentation pipelines.

## Install

```bash
npm install -g @islasola/docpal-cli
```

## Prerequisites

- Node.js 18+
- Feishu app with docx/wiki/drive/bitable/sheets read+write scopes
- GitHub PAT with `repo` scope (for publishing)

## Setup

1. Create a `.env` file:

```bash
APP_ID=<feishu-app-id>
APP_SECRET=<feishu-app-secret>
BASE_TOKEN=<bitable-app-token>
GITHUB_TOKEN=<github-pat>
FEISHU_HOST=https://open.feishu.cn
FEISHU_TENANT=<tenant-alias>
DOCPLA_AUTH_MODE=bot
```

2. Initialize DocPal:

```bash
docpal init
```

3. Authenticate (optional, for user mode):

```bash
docpal auth login
```

## Commands

### Manual lifecycle

```bash
docpal manual create --name "API Docs" --root-type wiki --root <token>
docpal manual add --doc-token <token> --manual "API Docs"
docpal manual approve --manual "API Docs" --all
docpal manual publish --manual "API Docs" --target <target>
docpal manual release --manual "API Docs" --target <target> --version v1.0.0
```

### Drafts

```bash
docpal draft create ./guide.md --parent <wiki-node> --manual "API Docs"
docpal draft update ./guide.md --doc <doc-token> --strategy replace
```

### Sync

```bash
docpal sync pull --repo <org/repo> --since 2026-01-01
```

## Global flags

- `--base <token>` — Bitable app token
- `--auth <bot|user>` — Authentication mode
- `--dry-run` — Preview without executing
- `--json` — Output as JSON
- `--force` — Override warnings
