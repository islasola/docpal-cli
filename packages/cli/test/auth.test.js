function parseArgs(args) {
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--scope' && args[i + 1]) {
            parsed.scope = args[++i];
        } else if (arg === '--domain' && args[i + 1]) {
            parsed.domain = args[++i];
        } else if (arg === '--no-open') {
            parsed.noOpen = true;
        } else if (arg === '--help' || arg === '-h') {
            parsed.help = true;
        }
    }
    return parsed;
}

function scopeForDomain(domain) {
    const domainScopes = {
        docs: 'offline_access auth:user.id:read docx:document:readonly docx:document',
        bitable: 'offline_access auth:user.id:read bitable:app:readonly bitable:app',
        drive: 'offline_access auth:user.id:read drive:drive:readonly drive:drive',
        wiki: 'offline_access auth:user.id:read wiki:wiki:readonly wiki:wiki',
        sheets: 'offline_access auth:user.id:read sheets:spreadsheet:readonly sheets:spreadsheet',
        calendar: 'offline_access auth:user.id:read calendar:calendar:readonly calendar:calendar',
    };

    if (domain && domainScopes[domain]) {
        return domainScopes[domain];
    }

    return null;
}

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    test('auth parseArgs parses --scope', () => {
        const result = parseArgs(['--scope', 'docx:document:readonly offline_access']);
        assertEqual(result.scope, 'docx:document:readonly offline_access');
    });

    test('auth parseArgs parses --domain', () => {
        const result = parseArgs(['--domain', 'docs']);
        assertEqual(result.domain, 'docs');
    });

    test('auth parseArgs parses --no-open', () => {
        const result = parseArgs(['--no-open']);
        assertTrue(result.noOpen, 'noOpen should be true');
    });

    test('auth parseArgs parses --help', () => {
        const result = parseArgs(['--help']);
        assertTrue(result.help, 'help should be true');
    });

    test('auth parseArgs handles multiple args', () => {
        const result = parseArgs(['--domain', 'bitable', '--no-open']);
        assertEqual(result.domain, 'bitable');
        assertTrue(result.noOpen, 'noOpen should be true');
        assertFalse(result.help, 'help should be false');
    });

    test('scopeForDomain returns correct scopes for docs', () => {
        const scope = scopeForDomain('docs');
        assertTrue(scope.includes('docx:document'), 'Should include docx scopes');
        assertTrue(scope.includes('offline_access'), 'Should include offline_access');
    });

    test('scopeForDomain returns correct scopes for bitable', () => {
        const scope = scopeForDomain('bitable');
        assertTrue(scope.includes('bitable:app'), 'Should include bitable scopes');
        assertTrue(scope.includes('offline_access'), 'Should include offline_access');
    });

    test('scopeForDomain returns null for unknown domain', () => {
        const scope = scopeForDomain('unknown');
        assertEqual(scope, null);
    });

    test('scopeForDomain returns correct scopes for all known domains', () => {
        const domains = ['docs', 'bitable', 'drive', 'wiki', 'sheets', 'calendar'];
        for (const domain of domains) {
            const scope = scopeForDomain(domain);
            assertTrue(scope !== null, `Should have scopes for domain: ${domain}`);
            assertTrue(scope.includes('offline_access'), `Should include offline_access for ${domain}`);
            assertTrue(scope.includes('auth:user.id:read'), `Should include auth scope for ${domain}`);
        }
    });
}

module.exports = { run };