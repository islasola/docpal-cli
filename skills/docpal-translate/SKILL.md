---
name: docpal-translate
description: Use when the user wants to translate a Feishu doc into another language — says "translate this doc to japanese", "create a chinese version of …", "localize this feishu document", "update the JA version of X", or "translate the source doc to <lang>". Triggers also include refreshing an existing translated doc when the source has changed.
---

# DocPal Translate

## Overview

Translate a Feishu doc inside the Claude Code conversation using Claude itself. No separate translator stack required — the legacy `docpal translate` CLI command has been removed. Translation happens in the chat, then results are pushed via `docpal draft`.

## How This Skill Works

Claude reads the source, generates the translation, validates against a glossary, and pushes via `docpal draft create` (new doc) or `docpal draft update` (existing doc). No `ANTHROPIC_API_KEY` / `DEEPL_API_KEY` / Ollama setup required.

## Workflow

1. **Ask for inputs:**
   - source doc token (wiki `node_token` or drive `document_id`)
   - target language code (`ja`, `zh`, `zh-TW`, `ko`, `de`, `fr`, `es`, `pt`, `it`, `ru`, `ar`, `hi`, `th`, `vi`)
   - source language code (default `en`)
   - either `--target <token>` (existing target doc) or `--folder <token>` (new doc location)
   - optional glossary override
2. **Fetch source content** — REQUIRED SUB-SKILL: `lark-doc`
3. **Load glossary** — REQUIRED SUB-SKILL: `lark-base`. Default table: `RI9ibDALMaec6ysKWwUcgJHLnrg/翻译规则`. Required columns: source term, target term per language.
4. **Translate** — produce markdown that:
   - Preserves all markdown structure (headings, lists, code blocks, links, MDX)
   - Locks all glossary `source → target` mappings exactly
   - Applies CJK spacing for `zh`/`ja` (spaces inserted at CJK↔non-CJK boundaries; skipped inside code blocks, inline code, HTML tags, and markdown link URLs)
   - Strips the H1 if it becomes the new doc title
5. **Glossary post-validation** — scan translation; for each glossary term, confirm target matches. Re-translate sections that drift.
6. **Show the user the translation** for review.
7. **Push:**
   - **New doc** (no `--target`): `docpal draft create <translation.md> --parent <folder> --manual <n>`
   - **Existing doc** (`--target` given): `docpal draft update <translation.md> --doc <target-token> --strategy replace [--manual <n>]`
8. **Verify** — open the Feishu URL.

## Always Ask Before

Fetching source, loading glossary (confirm the right table), pushing translated content. Never invoke the deprecated `docpal translate` CLI command.

## Common Mistakes

- Wrong target token type (node_token vs document_id)
- Glossary table missing required columns
- MDX components broken across translation segments
- Forgetting to dry-run a large doc
