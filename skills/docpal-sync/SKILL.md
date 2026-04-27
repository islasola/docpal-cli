---
name: docpal-sync
description: Use when the user wants to backport GitHub edits into Feishu — says "sync github changes back to feishu", "pull merged PRs into feishu", "backsync docs", "feishu is out of sync with github", or "update feishu from latest merges". Trigger also when the user says "I edited the MDX in the repo, push it back to feishu".
---

# DocPal Sync

## Overview

Sync merged GitHub PRs (created by `docpal manual publish`) back into Feishu so the source-of-truth in Feishu reflects post-merge edits.

## Prerequisites

- `GITHUB_TOKEN` set
- Manual already published at least once
- `tblDocs.Repo Path` populated
- `tblPullRequests` rows exist for prior publish PRs

## Workflow

1. **Ask for inputs:** `--repo <org/repo>` (required), `--since <YYYY-MM-DD>` (required) or `--commit-range <range>`, optional `--manual <n>` filter.
2. **Dry-run first:** `docpal sync pull --repo … --since … --dry-run --table` to preview matched PRs and mapped docs.
3. **Confirm with user**, then run without `--dry-run`.
4. **Resolve issues:** slug not found in `tblDocs` (orphan PR), MDX file deleted (handle as removal), manual edits in Feishu warn of overwrite.
5. **Verify** — re-run `--dry-run`; expect zero pending PRs. Check `tblSyncHistory` for new rows.

## Side Effects

| Table | Fields updated |
|---|---|
| `tblDocs` | Last Modified, Content Hash, Sync Status='Synced' |
| `tblDocPublishPaths` | Status='Merged' |
| `tblPullRequests` | Status='Merged', Merged At |
| `tblSyncHistory` | New row per synced doc |

## Common Mistakes

- Running without `--since` (errors)
- Syncing while Feishu doc has unsaved manual edits (overwritten silently)
- Wrong repo case

## Always Ask Before

Running sync without `--dry-run`, when there are unsaved Feishu edits.
