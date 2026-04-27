---
name: docpal-manual
description: Use when the user wants to organize Feishu docs into a structured manual, handbook, or Docusaurus site. Triggers include "create a manual", "add this doc to the manual", "register these wiki pages", "approve the manual", "publish docs to github", "release v2 of the docs", "what's the publish status?", or "convert this wiki folder into a manual".
---

# DocPal Manual

## Overview

A manual is a book-like collection of doc pages stored in a Bitable. Each page has a slug, sidebar position, optional parent, a status (`Draft → In Review → Approved`), and publish targets. The lifecycle is: create → register → approve → publish → release.

## Stage 1 — Create or Convert

Ask: manual name, root type (`wiki`|`drive`), root token, default publish targets.

- **Create empty:** `docpal manual create --name <n> --root-type <wiki|drive> --root <token>`
- **Convert existing folder:** `docpal manual convert --from <token> --name <n> --root-type <wiki|drive> --targets <list>` (auto-registers every doc found)

Verify: `docpal manual list`

## Stage 2 — Register Pages

When the user has a Feishu doc that should join the manual, ask for doc token, manual name, optional slug/parent/position.

`docpal manual add --doc-token <token> --manual <n> [--slug <s>] [--parent <token>] [--position <n>] [--force]`

Slug auto-derived via `slugify(title, { lower: true, strict: true })` if omitted. Always preview with `--dry-run` for batches.

## Stage 3 — Approve

Ask: which manual; single slug or all docs?

- **Single:** `docpal manual approve --manual <n> --slug <s>`
- **Bulk:** `docpal manual approve --manual <n> --all`

Use `--force` only to re-approve already-Approved docs.

## Stage 4 — Publish

Ask: manual, target name; optionally a single slug or `--remove` for deletion PRs.

- **Whole manual:** `docpal manual publish --manual <n> --target <t>`
- **Single doc:** add `--slug <s>`
- **CJK heading anchors:** `--source-doc-token <token>`

Outputs PR URLs; tracked in `tblPullRequests`.

## Stage 5 — Release

Ask: manual, target, version string.

`docpal manual release --manual <n> --target <t> --version <v>`

Snapshots the manual into a versioned PR.

## Status & Inspection

- `docpal manual list` — all manuals
- `docpal manual status --manual <n>` — per-doc status, last published, open PRs
- Add `--table` for human-readable, `--json` for scripting

## Common Mistakes

- Skipping `approve` before `publish` (only Approved docs are published)
- Using `--auth user` in CI (use bot mode for automation)
- Wiki `node_token` vs drive `document_id` mismatched against manual `--root-type`
- Slug collisions on `manual add` without `--force`
- Forgetting `--source-doc-token` when CJK headings need stable anchors

## Companion Skills

- `docpal-draft` for authoring new pages before registering
- `docpal-translate` for localizing pages
- `docpal-sync` after merges

## Always Ask Before

Creating a manual, bulk approving, publishing, or releasing a version. Always offer `--dry-run` first for `convert`, `publish`, and `release`.
