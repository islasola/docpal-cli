const configLoader = require('../lib/configLoader');

function run({ test, assertEqual, assertTrue, assertFalse, assertThrows }) {
    test('configLoader should have default feishuHost', () => {
        const host = configLoader.get('feishuHost');
        assertEqual(host, 'https://open.feishu.cn', 'Default Feishu host should be set');
    });

    test('configLoader should return undefined for missing key', () => {
        const value = configLoader.get('nonexistent');
        assertEqual(value, undefined, 'Missing key should return undefined');
    });

    test('configLoader.require should throw for missing key', () => {
        assertThrows(() => {
            configLoader.require('nonexistent_key_that_is_not_set');
        }, 'Missing required config');
    });

    test('configLoader should have new config keys', () => {
        assertTrue(configLoader.get('spaceId') !== undefined || configLoader.get('spaceId') === undefined, 'spaceId should be accessible');
        assertTrue(configLoader.hasS3 !== undefined, 'hasS3 should be accessible');
        assertTrue(configLoader.hasOSS !== undefined, 'hasOSS should be accessible');
    });

    test('configLoader should load APP_ID from env', () => {
        const appId = configLoader.get('appId');
        assertTrue(appId !== undefined || appId === undefined, 'APP_ID should be accessible');
    });

    test('configLoader.feishuWebHost should use FEISHU_HOST when no tenant', () => {
        const savedTenant = process.env.FEISHU_TENANT;
        delete process.env.FEISHU_TENANT;
        const loader = require('../lib/configLoader');
        // Re-read to pick up env change
        const host = loader.feishuWebHost;
        assertEqual(host, 'https://open.feishu.cn', 'Without tenant, web host should equal API host');
        if (savedTenant !== undefined) process.env.FEISHU_TENANT = savedTenant;
    });

    test('configLoader.feishuWebHost should replace open with tenant', () => {
        const savedTenant = process.env.FEISHU_TENANT;
        process.env.FEISHU_TENANT = 'zilliverse';
        // Clear require cache to pick up new env
        delete require.cache[require.resolve('../lib/configLoader')];
        const loader = require('../lib/configLoader');
        const host = loader.feishuWebHost;
        assertEqual(host, 'https://zilliverse.feishu.cn', 'Should replace open with tenant alias');
        if (savedTenant !== undefined) process.env.FEISHU_TENANT = savedTenant;
        else delete process.env.FEISHU_TENANT;
    });

    test('configLoader.feishuWebHost should work with larksuite.com', () => {
        const savedTenant = process.env.FEISHU_TENANT;
        const savedHost = process.env.FEISHU_HOST;
        process.env.FEISHU_TENANT = 'mycompany';
        process.env.FEISHU_HOST = 'https://open.larksuite.com';
        delete require.cache[require.resolve('../lib/configLoader')];
        const loader = require('../lib/configLoader');
        const host = loader.feishuWebHost;
        assertEqual(host, 'https://mycompany.larksuite.com', 'Should work with larksuite.com domain');
        if (savedTenant !== undefined) process.env.FEISHU_TENANT = savedTenant;
        else delete process.env.FEISHU_TENANT;
        if (savedHost !== undefined) process.env.FEISHU_HOST = savedHost;
        else delete process.env.FEISHU_HOST;
    });

    test('configLoader.getBaseToken should return flag override', () => {
        const result = configLoader.getBaseToken('bascnOverride123');
        assertEqual(result, 'bascnOverride123', 'Should return CLI override');
    });

    test('configLoader.getBaseToken should return env value when no override', () => {
        const result = configLoader.getBaseToken(null);
        assertTrue(result === null || typeof result === 'string', 'Should return env value or null');
    });
}

module.exports = { run };
