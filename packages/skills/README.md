# @islasola/docpal-skills

Reusable AI agent skills for DocPal documentation workflows.

## Install

### Via npx skills (recommended)

```bash
npx skills add islasola/docpal-cli
```

### Via npm

```bash
npm install @islasola/docpal-skills
```

## Skills

- **`docpal-onboard`** — first-time setup of DocPal + Feishu credentials
- **`docpal-manual`** — manual lifecycle: create → register → approve → publish → release
- **`docpal-draft`** — author technical docs from reference material and push to Feishu
- **`docpal-translate`** — translate Feishu docs using Claude, validate glossary, push via draft
- **`docpal-sync`** — backsync merged GitHub PRs into Feishu

Each skill is a `SKILL.md` file following the [Claude Code skill format](https://code.claude.com/docs/en/skills).

## Repository

https://github.com/islasola/docpal-cli
