#!/usr/bin/env node

const path = require('path');
const dotenv = require('dotenv');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const envPath = process.env.DOCPAL_SMOKE_ENV || path.join(repoRoot, '.env.smoke');
dotenv.config({ path: envPath });

const bitableClient = require('../lib/bitableClient');
const larkDocClient = require('../lib/larkDocClient');
const MarkdownToFeishu = require('../lib/markdownToFeishu');
const { ensureTables } = require('../src/commands/init');
const { contentHash } = require('../lib/contentHash');
const configLoader = require('../lib/configLoader');

const requiredEnv = [
    'APP_ID',
    'APP_SECRET',
    'FEISHU_HOST',
    'SMOKE_ROOT_TYPE',
    'SMOKE_ROOT_TOKEN',
    'SMOKE_PARENT_TOKEN',
];

function log(message) {
    console.log(`[smoke] ${message}`);
}

function fail(message) {
    console.error(`[smoke] ${message}`);
    process.exit(1);
}

function assertEnv() {
    const docsOnly = process.argv.includes('--docs-only');
    const keys = docsOnly
        ? requiredEnv.filter(key => key !== 'SMOKE_ROOT_TYPE' && key !== 'SMOKE_ROOT_TOKEN')
        : requiredEnv;
    const missing = keys.filter(key => !process.env[key]);
    if (missing.length > 0) {
        fail(`Missing required env keys in ${envPath}: ${missing.join(', ')}`);
    }

    if (!docsOnly && !['wiki', 'drive'].includes(process.env.SMOKE_ROOT_TYPE)) {
        fail('SMOKE_ROOT_TYPE must be "wiki" or "drive"');
    }
}

function makeOutput() {
    return {
        progress: message => log(message),
    };
}

async function resolveBaseToken(stamp) {
    if (process.env.BASE_TOKEN) {
        log('Using BASE_TOKEN from .env.smoke');
        return process.env.BASE_TOKEN;
    }

    log('BASE_TOKEN is empty; creating a temporary smoke Bitable');
    const base = await bitableClient.createBase(`DocPal Smoke ${stamp}`, '');
    const baseToken = base.app?.app_token || base.app_token || base.app?.token;
    if (!baseToken) {
        throw new Error('Created Bitable response did not include app_token');
    }
    log(`Created smoke Bitable: ${baseToken}`);
    return baseToken;
}

async function findRecordBySlug(baseToken, slug) {
    const docs = await bitableClient.listAllRecords(baseToken, 'tblDocs', { pageSize: 100 });
    return (docs.items || []).find(record => record.fields?.Slug === slug) || null;
}

async function main() {
    assertEnv();

    const docsOnly = process.argv.includes('--docs-only');
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const title = `DocPal CLI Smoke ${stamp}`;
    const slug = `docpal-cli-smoke-${stamp.toLowerCase()}`;
    const manualName = `DocPal CLI Smoke ${stamp}`;
    let baseToken = null;
    let manualRecordId = null;

    if (!docsOnly) {
        baseToken = await resolveBaseToken(stamp);

        log('Ensuring Bitable schema');
        const ensured = await ensureTables(baseToken, makeOutput());
        const missingTables = Object.entries(ensured.tableIds)
            .filter(([, tableId]) => !tableId)
            .map(([name]) => name);
        if (Object.keys(ensured.tableIds).length === 0 || missingTables.length > 0) {
            throw new Error(`Bitable schema setup did not complete. Missing table IDs: ${missingTables.join(', ') || 'all'}`);
        }

        log(`Creating manual record: ${manualName}`);
        const manual = await bitableClient.createRecord(baseToken, 'tblManuals', {
            'Name': manualName,
            'Root Type': process.env.SMOKE_ROOT_TYPE === 'wiki' ? 'Wiki Space' : 'Drive Folder',
            'Root Token': process.env.SMOKE_ROOT_TOKEN,
            'Description': 'Created by packages/cli/scripts/smoke-test.js',
        });
        manualRecordId = manual.record?.record_id || manual.record_id;
        if (!manualRecordId) {
            throw new Error('Manual record response did not include record_id');
        }
    }

    log(`Creating Feishu doc under SMOKE_PARENT_TOKEN: ${title}`);
    const doc = await larkDocClient.createDocInParent(process.env.SMOKE_PARENT_TOKEN, title, {
        parentType: 'wiki',
    });
    const documentId = doc.document?.document_id || doc.document_id;
    if (!documentId) {
        throw new Error('Create document response did not include document_id');
    }

    const nodeToken = doc.document?.node_token || doc.node?.node_token;
    const resolved = nodeToken
        ? { url: `${configLoader.feishuWebHost}/wiki/${nodeToken}`, nodeToken }
        : await larkDocClient.resolveDocUrl(documentId, configLoader.feishuWebHost);
    const docLink = resolved.url;
    log(`Created document: ${documentId}${nodeToken ? ` (wiki node ${nodeToken})` : ''}`);

    const markdown = `---
title: ${title}
slug: ${slug}
---

# ${title}

This page was created by the DocPal CLI smoke test.

## Verification

- Bitable schema was ensured.
- A manual record was created.
- This markdown content was patched into Feishu.

\`\`\`bash
docpal smoke
\`\`\`
`;

    log('Patching markdown content into the Feishu doc');
    const converter = new MarkdownToFeishu();
    const patchResult = await converter.patchDocument({
        documentId,
        content: markdown,
        strategy: 'replace',
    });

    let docRecordId = null;
    if (!docsOnly) {
        log('Creating tblDocs registry row');
        const docRecord = await bitableClient.createRecord(baseToken, 'tblDocs', {
            'Doc': { link: docLink, text: title },
            'Slug': slug,
            'Status': 'Draft',
            'Progress': 'Writing',
            'Manual': [manualRecordId],
            'Content Hash': contentHash(markdown),
            'Sync Status': 'Synced',
        });
        docRecordId = docRecord.record?.record_id || docRecord.record_id;
    }

    log(`Verifying Feishu blocks${docsOnly ? '' : ' and Bitable registry'}`);
    const blocks = await larkDocClient.getAllBlocks(documentId);

    if (!docsOnly) {
        const registryRecord = await findRecordBySlug(baseToken, slug);
        if (!registryRecord) {
            throw new Error(`Could not find tblDocs record for slug ${slug}`);
        }
    }
    if (!blocks.items || blocks.items.length < 2) {
        throw new Error(`Expected document to contain page + content blocks, got ${blocks.items?.length || 0}`);
    }

    console.log(JSON.stringify({
        ok: true,
        mode: docsOnly ? 'docs-only' : 'full',
        manual_record_id: manualRecordId,
        doc_record_id: docRecordId,
        document_id: documentId,
        node_token: nodeToken,
        slug,
        link: docLink,
        blocks_seen: blocks.items.length,
        patch: patchResult,
    }, null, 2));
}

main().catch(err => {
    fail(err.stack || err.message);
});
