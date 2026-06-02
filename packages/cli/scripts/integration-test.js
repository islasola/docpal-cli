#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const dotenv = require('dotenv');

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const envPath = process.env.DOCPAL_SMOKE_ENV || path.join(repoRoot, '.env.smoke');
dotenv.config({ path: envPath });

const manualCommand = require('../src/commands/manual');
const draftCommand = require('../src/commands/draft');
const bitableClient = require('../lib/bitableClient');
const larkDocClient = require('../lib/larkDocClient');
const { ensureTables } = require('../src/commands/init');

const requiredEnv = [
    'APP_ID',
    'APP_SECRET',
    'FEISHU_HOST',
    'BASE_TOKEN',
    'SMOKE_ROOT_TYPE',
    'SMOKE_ROOT_TOKEN',
    'SMOKE_PARENT_TOKEN',
];

function log(message) {
    console.log(`[integration] ${message}`);
}

function fail(message) {
    console.error(`[integration] ${message}`);
    process.exit(1);
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function assertEnv() {
    const missing = requiredEnv.filter(key => !process.env[key]);
    if (missing.length > 0) {
        fail(`Missing required env keys in ${envPath}: ${missing.join(', ')}`);
    }
    if (!['wiki', 'drive'].includes(process.env.SMOKE_ROOT_TYPE)) {
        fail('SMOKE_ROOT_TYPE must be "wiki" or "drive"');
    }
}

function makeOutput() {
    return {
        progress: message => log(message),
    };
}

function writeTempMarkdown(dir, filename, content) {
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
}

function extractRecordIds(fieldValue) {
    if (!fieldValue) return [];
    const values = Array.isArray(fieldValue) ? fieldValue : [fieldValue];
    const ids = [];
    for (const value of values) {
        if (typeof value === 'string') {
            ids.push(value);
        } else if (value && typeof value === 'object') {
            if (Array.isArray(value.record_ids)) ids.push(...value.record_ids);
            if (value.record_id) ids.push(value.record_id);
            if (value.id) ids.push(value.id);
        }
    }
    return ids;
}

function extractUrl(fieldValue) {
    if (!fieldValue) return '';
    if (typeof fieldValue === 'string') return fieldValue;
    if (fieldValue.link) return fieldValue.link;
    if (Array.isArray(fieldValue)) {
        const item = fieldValue[0];
        return item?.link || item?.url || '';
    }
    return fieldValue.url || '';
}

function extractWikiTokenFromRecord(record) {
    const url = extractUrl(record.fields.Doc);
    const match = url.match(/\/wiki\/(\w+)/);
    return match ? match[1] : null;
}

async function findManualByName(baseToken, name) {
    const manuals = await bitableClient.listAllRecords(baseToken, 'tblManuals', { pageSize: 100 });
    return (manuals.items || []).find(record => record.fields.Name === name) || null;
}

async function findDocBySlug(baseToken, manualRecordId, slug) {
    const docs = await bitableClient.listAllRecords(baseToken, 'tblDocs', { pageSize: 500 });
    return (docs.items || []).find(record => {
        const manualIds = extractRecordIds(record.fields.Manual);
        return record.fields.Slug === slug && manualIds.includes(manualRecordId);
    }) || null;
}

async function verifyDocContent(record, expectedMinimumBlocks) {
    const wikiToken = extractWikiTokenFromRecord(record);
    assert(wikiToken, `Could not extract wiki token for ${record.fields.Slug}`);

    const node = await larkDocClient.getWikiNode(wikiToken);
    const documentId = node.node?.obj_token;
    assert(documentId, `Could not resolve document id for ${record.fields.Slug}`);

    const blocks = await larkDocClient.getAllBlocks(documentId);
    assert(
        blocks.items && blocks.items.length >= expectedMinimumBlocks,
        `Expected ${record.fields.Slug} to have at least ${expectedMinimumBlocks} blocks, got ${blocks.items?.length || 0}`
    );

    return {
        wikiToken,
        documentId,
        blocksSeen: blocks.items.length,
    };
}

async function runCommand(label, fn) {
    log(label);
    await fn();
}

async function main() {
    assertEnv();

    const baseToken = process.env.BASE_TOKEN;
    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
    const manualName = `DocPal Integration ${stamp}`;
    const sourceSlug = `docpal-integration-source-${stamp.toLowerCase()}`;
    const translationSlug = `docpal-integration-ja-${stamp.toLowerCase()}`;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'docpal-integration-'));
    const globalArgs = { outputFormat: 'json' };

    log('Ensuring Bitable schema');
    await ensureTables(baseToken, makeOutput());

    await runCommand('Creating manual through command module', () => manualCommand.run('create', [
        '--name', manualName,
        '--root-type', process.env.SMOKE_ROOT_TYPE,
        '--root', process.env.SMOKE_ROOT_TOKEN,
        '--base', baseToken,
        '--json',
    ], globalArgs));

    const manual = await findManualByName(baseToken, manualName);
    assert(manual, `Manual not found after create: ${manualName}`);

    await runCommand('Listing manuals through command module', () => manualCommand.run('list', [
        '--base', baseToken,
        '--json',
    ], globalArgs));

    const sourceV1 = writeTempMarkdown(tempDir, 'source-v1.md', `---
title: DocPal Integration Source ${stamp}
slug: ${sourceSlug}
---

# DocPal Integration Source ${stamp}

This source document validates manual and doc management.

## Source Section

- Created through \`draft create\`
- Updated through \`draft update\`
`);

    await runCommand('Creating source doc through draft create', () => draftCommand.run('create', [
        sourceV1,
        '--parent', process.env.SMOKE_PARENT_TOKEN,
        '--manual', manualName,
        '--slug', sourceSlug,
        '--base', baseToken,
        '--json',
    ], globalArgs));

    let sourceDoc = await findDocBySlug(baseToken, manual.record_id, sourceSlug);
    assert(sourceDoc, `Source doc record not found: ${sourceSlug}`);
    const sourceNodeToken = extractWikiTokenFromRecord(sourceDoc);
    assert(sourceNodeToken, 'Source doc record does not contain a wiki URL');

    const sourceV2 = writeTempMarkdown(tempDir, 'source-v2.md', `---
title: DocPal Integration Source ${stamp}
slug: ${sourceSlug}
---

# DocPal Integration Source ${stamp}

This source document was updated during the integration test.

## Source Section

- Created through \`draft create\`
- Updated through \`draft update\`
- Approved through \`manual approve\`
`);

    await runCommand('Updating source doc through draft update', () => draftCommand.run('update', [
        sourceV2,
        '--doc', sourceNodeToken,
        '--manual', manualName,
        '--base', baseToken,
        '--strategy', 'replace',
        '--json',
    ], globalArgs));

    sourceDoc = await findDocBySlug(baseToken, manual.record_id, sourceSlug);
    assert(sourceDoc.fields['Content Hash'], 'Source doc content hash was not updated');
    assert(sourceDoc.fields['Sync Status'] === 'Synced', 'Source doc sync status should be Synced after update');

    const translationV1 = writeTempMarkdown(tempDir, 'translation-ja-v1.md', `---
title: DocPal 統合翻訳 ${stamp}
slug: ${translationSlug}
---

# DocPal 統合翻訳 ${stamp}

これは DocPal の翻訳管理ワークフローを検証するためのページです。

## 検証

- 翻訳は \`draft create\` で作成されます。
- 翻訳は \`draft update\` で更新されます。
`);

    await runCommand('Creating translated doc through draft create', () => draftCommand.run('create', [
        translationV1,
        '--parent', process.env.SMOKE_PARENT_TOKEN,
        '--manual', manualName,
        '--slug', translationSlug,
        '--base', baseToken,
        '--json',
    ], globalArgs));

    let translatedDoc = await findDocBySlug(baseToken, manual.record_id, translationSlug);
    assert(translatedDoc, `Translated doc record not found: ${translationSlug}`);
    const translationNodeToken = extractWikiTokenFromRecord(translatedDoc);
    assert(translationNodeToken, 'Translated doc record does not contain a wiki URL');

    const translationV2 = writeTempMarkdown(tempDir, 'translation-ja-v2.md', `---
title: DocPal 統合翻訳 ${stamp}
slug: ${translationSlug}
---

# DocPal 統合翻訳 ${stamp}

これは更新済みの翻訳ページです。

## 検証

- 原文の更新後に翻訳を置き換えます。
- 用語と構造を保持します。
- \`docpal draft update\` が翻訳更新の管理パスです。
`);

    await runCommand('Updating translated doc through draft update', () => draftCommand.run('update', [
        translationV2,
        '--doc', translationNodeToken,
        '--manual', manualName,
        '--base', baseToken,
        '--strategy', 'replace',
        '--json',
    ], globalArgs));

    translatedDoc = await findDocBySlug(baseToken, manual.record_id, translationSlug);
    assert(translatedDoc.fields['Content Hash'], 'Translated doc content hash was not updated');
    assert(translatedDoc.fields['Sync Status'] === 'Synced', 'Translated doc sync status should be Synced after update');

    await runCommand('Approving all docs in manual through manual approve', () => manualCommand.run('approve', [
        '--manual', manualName,
        '--all',
        '--base', baseToken,
        '--json',
    ], globalArgs));

    await runCommand('Reading manual status through command module', () => manualCommand.run('status', [
        '--manual', manualName,
        '--base', baseToken,
        '--json',
    ], globalArgs));

    sourceDoc = await findDocBySlug(baseToken, manual.record_id, sourceSlug);
    translatedDoc = await findDocBySlug(baseToken, manual.record_id, translationSlug);
    assert(sourceDoc.fields.Status === 'Approved', 'Source doc should be Approved');
    assert(translatedDoc.fields.Status === 'Approved', 'Translated doc should be Approved');
    assert(sourceDoc.fields.Progress === 'Ready', 'Source doc progress should be Ready');
    assert(translatedDoc.fields.Progress === 'Ready', 'Translated doc progress should be Ready');

    const sourceVerification = await verifyDocContent(sourceDoc, 4);
    const translationVerification = await verifyDocContent(translatedDoc, 4);

    console.log(JSON.stringify({
        ok: true,
        manual: {
            name: manualName,
            record_id: manual.record_id,
        },
        source_doc: {
            slug: sourceSlug,
            record_id: sourceDoc.record_id,
            status: sourceDoc.fields.Status,
            progress: sourceDoc.fields.Progress,
            sync_status: sourceDoc.fields['Sync Status'],
            ...sourceVerification,
        },
        translated_doc: {
            slug: translationSlug,
            record_id: translatedDoc.record_id,
            status: translatedDoc.fields.Status,
            progress: translatedDoc.fields.Progress,
            sync_status: translatedDoc.fields['Sync Status'],
            ...translationVerification,
        },
        translation_workflow: 'draft create + draft update',
    }, null, 2));
}

main().catch(err => {
    fail(err.stack || err.message);
});
