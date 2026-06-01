---
name: docpal-onboard
description: Use when the user has just installed the docpal plugin, says "set up docpal", "install docpal", "configure feishu docs", "first time using docpal", or has no .env/BASE_TOKEN/manual yet. Use also when the user mentions setting up Feishu app credentials, OAuth, or GitHub publishing for the first time.
---

# DocPal Onboard

## Overview

One-time setup of DocPal CLI and its runtime dependency, lark-cli.

## Prerequisites

- Node.js 18+
- Feishu app with docx/wiki/drive/bitable/sheets read+write scopes
- GitHub PAT with `repo` scope

## Setup Steps

1. **Install lark-cli** — REQUIRED SUB-SKILL: `lark-shared`. Run lark-cli auth setup first so credentials are reusable.
2. **Install docpal-cli** — `npm install -g docpal-cli`
3. **Ask user** for `APP_ID`, `APP_SECRET`, `FEISHU_TENANT`, `GITHUB_TOKEN`, and auth mode (`bot`|`user`)
4. **Write `.env`** — populate with answers; leave `BASE_TOKEN=` empty
5. **Authenticate** — if user mode: `docpal auth login` (OAuth on `localhost:8401`)
6. **Initialize** — `docpal init [--name "MyDocs"]` → capture `BASE_TOKEN`, ask user to update `.env`
7. **Verify** — `docpal manual list`, `docpal auth status`

## Common Mistakes

- Wrong `FEISHU_HOST` (cn vs international)
- Missing Feishu app scopes → cryptic 403 errors
- Skipping `init`
- Env typo `DOCPLA_AUTH_MODE`; use `DOCPAL_AUTH_MODE`

## Next Step

Use `docpal-manual` to create the first manual.
