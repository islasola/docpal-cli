---
name: docpal-draft
description: Use when the user wants to author technical documentation — says "write a doc about X", "draft a guide for feature Y", "scaffold an API reference", "generate documentation from this spec/code", "push markdown to feishu", or "update this feishu doc with new content". Use also when the user provides reference material and wants a polished doc out the other end.
---

# DocPal Draft

## Overview

Generate a technical doc from reference material using a fixed framework, then push as a Feishu draft or update an existing Feishu doc.

## Framework (Mandatory Document Structure)

Every generated doc has these sections in order:

- **Title (H1)** — feature name
- **Short description** — 1–2 sentences directly under H1
- **Overview** — what is this feature, why does it exist
- **Application scenarios** — 2–4 concrete use cases
- **Prerequisites** — required setup, deps, permissions
- **Limits** — known constraints, unsupported cases
- **Usage** — code blocks + step-by-step walkthrough
- **FAQs** — 3–5 likely questions with terse answers

## Workflow — Create a New Draft

1. **Ask for reference material** — file path, URL, code snippet, or pasted text. Do not proceed without it.
2. **Ask for target manual + parent wiki node token** — run `docpal manual list` if unknown.
3. **Ask for slug, type, description, added-since** if scaffold metadata applies.
4. **Generate markdown** following the framework; save to a temp file.
5. **Show the user the draft** for review before pushing.
6. **Push** — `docpal draft create <file> --parent <token> --manual <n> [--slug --targets --dry-run]`
7. **Verify** — open the returned Feishu URL.

## Workflow — Update an Existing Feishu Doc

1. **Ask for doc token** (wiki `node_token` or drive `document_id`) and new content.
2. **Ask for strategy:** `replace` (overwrite; default), `append` (add at end), or `smart` (block-level diff).
3. **Push** — `docpal draft update <file> --doc <token> [--strategy <s>] [--manual <n>] [--dry-run]`
4. If `--manual` is provided, refresh the registry row (Last Modified, Content Hash, Sync Status).

## Command Reference

| Flag | Required | Notes |
|---|---|---|
| `create` | subcommand | Push new markdown to Feishu |
| `update` | subcommand | Patch an existing Feishu doc |
| `<file>` | conditional | Markdown file; falls back to stdin if omitted |
| `--parent <token>` | create | Parent wiki node token |
| `--doc <token>` | update | Wiki node_token or drive document_id |
| `--strategy <s>` | update | `replace` \| `append` \| `smart` (default: replace) |
| `--manual <name>` | create/update | Auto-selected if only one |
| `--dry-run` | no | Preview without pushing |

## Tips

- Short paragraphs, runnable code blocks
- MDX-friendly: no raw `<` outside code
- Use `--manual` on `draft update` to keep `tblDocs` in sync

## Always Ask Before

Generating a doc (need reference), pushing or updating in Feishu.
