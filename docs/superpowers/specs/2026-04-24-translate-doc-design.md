# Design: `translate doc` Subcommand

## Context

The existing `docpal translate` command supports registry-based translation via Feishu Bitable records (`--source-base`, `--target-base`). Users want a lightweight, direct doc-to-doc translation path that bypasses the registry entirely — parse a single source doc, translate it, and push the result to a target doc.

## Goals

- Enable one-off translation of a single Feishu document without Bitable setup.
- Support both wiki and drive document tokens.
- Create a new doc when no target is specified; update an existing doc when `--target` is provided.
- Reuse existing translation and Feishu push infrastructure.

## Non-Goals

- Folder/tree recursive translation (out of scope; use `translate run` with bitables).
- Local file output (e.g., `--output file.md`) — push-to-Feishu is the only output path.

## CLI Interface

```
docpal translate doc --source <doc-token> [--target <doc-token>] [options]

Options:
  --source <token>      Source doc token (wiki or drive) — required
  --target <token>      Target doc token (wiki or drive) — optional
  --lang <code>         Target language code (default: ja)
  --source-lang <code>  Source language code (default: en)
  --translator <type>   Translation engine: claude, feishu, deepl, ollama (default: claude)
  --title <title>       Title for the new doc when creating (default: source doc title)
  --folder <token>      Parent folder token when creating a new doc
  --dry-run             Preview translation without pushing to Feishu
  --json                Output as JSON
  --table               Output as aligned table
  --help, -h            Show help
```

## Behavior

1. **Validate arguments**: `--source` is required. If `--target` is omitted, `--folder` is required to know where to create the new doc.
2. **Fetch source**: Call `larkDocClient.getAllBlocks(sourceToken)` to retrieve Feishu blocks.
3. **Convert to MDX**: Pass blocks through `blocksToMdx()` to produce intermediate MDX.
4. **Translate**: Feed MDX into the selected translator (default `claude`). Reuse `ClaudeTranslator` from `lib/translation/translators/`.
5. **Push to target**:
   - **Create mode** (`--target` omitted): Use `MarkdownToFeishu.pushToFeishu({ content, title, folderToken })` to create a new doc. Return the new doc URL.
   - **Update mode** (`--target` provided): Use `MarkdownToFeishu.patchDocument({ documentId, content, strategy: 'smart' })` to overwrite the target doc content. Return update confirmation.
6. **Output**: Print result in the selected format (`text`, `json`, `table`).

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Missing `--source` | Exit 1, print usage |
| Missing `--folder` in create mode | Exit 1 with clear message |
| Invalid source token | Propagate Feishu API error, exit 1 |
| Translation failure | Exit 1, log error message |
| Target doc not found in update mode | Propagate Feishu API error, exit 1 |

## Reused Components

- `lib/larkDocClient.js` — block fetching, wiki node lookup
- `lib/mdxWriter.js` — `blocksToMdx()`
- `lib/translation/translators/claude.js` — Claude translation engine
- `lib/markdownToFeishu.js` — `pushToFeishu()`, `patchDocument()`

## Files to Modify

- `src/commands/translate.js` — add `doc` subcommand routing, argument parsing, and execution logic.

## Testing

- Manual end-to-end test: translate a wiki doc to a new doc, then to an existing doc.
- Verify `--dry-run` prints translated content without pushing.
- Verify `--json` and `--table` outputs.
