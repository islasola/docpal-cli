const DocGenerator = require('../lib/docGenerator');

function run({ test, assertEqual, assertTrue, assertFalse }) {
    test('DocGenerator: concept scaffold with defaults', () => {
        const gen = new DocGenerator();
        const content = gen.generate({ type: 'concept', title: 'My Concept', slug: 'my-concept' });
        assertTrue(content.includes('# My Concept'), 'Should include title heading');
        assertTrue(content.includes('---'), 'Should include front matter');
        assertTrue(content.includes('## Overview'), 'Should include overview section');
        assertTrue(content.includes('<!-- TODO'), 'Should include TODO markers');
    });

    test('DocGenerator: function scaffold with params', () => {
        const gen = new DocGenerator();
        const content = gen.generate({
            type: 'function',
            title: 'insert()',
            slug: 'insert',
            params: [
                { name: 'collection', type: 'string', required: true, description: 'Collection name' },
                { name: 'data', type: 'object', required: true, description: 'Data to insert' }
            ]
        });
        assertTrue(content.includes('# insert()'), 'Should include title');
        assertTrue(content.includes('## Request Syntax'), 'Should include request syntax');
        assertTrue(content.includes('collection'), 'Should include param name');
        assertTrue(content.includes('[REQUIRED]'), 'Should mark required params');
        assertTrue(content.includes('**RETURN TYPE:**'), 'Should include return type');
        assertTrue(content.includes('## Examples'), 'Should include examples');
    });

    test('DocGenerator: function scaffold without params', () => {
        const gen = new DocGenerator();
        const content = gen.generate({ type: 'function', title: 'connect()', slug: 'connect' });
        assertTrue(content.includes('<!-- TODO: Add parameter descriptions'), 'Should include TODO for params');
    });

    test('DocGenerator: class scaffold', () => {
        const gen = new DocGenerator();
        const content = gen.generate({ type: 'class', title: 'MilvusClient', slug: 'milvus-client' });
        assertTrue(content.includes('# MilvusClient'), 'Should include class title');
        assertTrue(content.includes('## Constructor'), 'Should include constructor section');
        assertTrue(content.includes('## Methods'), 'Should include methods section');
    });

    test('DocGenerator: enum scaffold with values', () => {
        const gen = new DocGenerator();
        const content = gen.generate({
            type: 'enum',
            title: 'IndexType',
            slug: 'index-type',
            values: [
                { name: 'IVF_FLAT', description: 'IVF with flat quantization' },
                { name: 'IVF_SQ8', description: 'IVF with scalar quantization' }
            ]
        });
        assertTrue(content.includes('# IndexType'), 'Should include enum title');
        assertTrue(content.includes('IVF_FLAT'), 'Should include enum value');
        assertTrue(content.includes('## Values'), 'Should include values section');
    });

    test('DocGenerator: guide scaffold', () => {
        const gen = new DocGenerator();
        const content = gen.generate({ type: 'guide', title: 'Getting Started', slug: 'getting-started' });
        assertTrue(content.includes('# Getting Started'), 'Should include guide title');
        assertTrue(content.includes('## Prerequisites'), 'Should include prerequisites');
        assertTrue(content.includes('## Steps'), 'Should include steps');
        assertTrue(content.includes('## Troubleshooting'), 'Should include troubleshooting');
    });

    test('DocGenerator: front matter generation', () => {
        const gen = new DocGenerator({ addedSince: '2.6', targets: ['Milvus', 'ZillizCloud'] });
        const fm = gen.generateFrontMatter({
            title: 'Test API',
            slug: 'test-api',
            description: 'A test API',
            type: 'function',
            addedSince: '2.6',
            keywords: ['test', 'api']
        });
        assertTrue(fm.includes('---'), 'Should have front matter delimiters');
        assertTrue(fm.includes('title: Test API'), 'Should include title');
        assertTrue(fm.includes('slug: /test-api'), 'Should include slug');
    });

    test('DocGenerator: target include tags', () => {
        const gen = new DocGenerator();
        const content = gen.generate({
            type: 'concept',
            title: 'Multi-target',
            slug: 'multi-target',
            targets: ['Milvus', 'ZillizCloud']
        });
        assertTrue(content.includes('<include target="Milvus,ZillizCloud">'), 'Should include target tag');
        assertTrue(content.includes('</include>'), 'Should close target tag');
    });

    test('DocGenerator: deprecated_since in front matter', () => {
        const gen = new DocGenerator();
        const content = gen.generate({
            type: 'function',
            title: 'Old API',
            slug: 'old-api',
            deprecatedSince: '2.6'
        });
        assertTrue(content.includes('deprecated_since'), 'Should include deprecated_since in front matter');
    });
}

module.exports = { run };