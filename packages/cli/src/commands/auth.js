const userAuth = require('../../lib/userAuth');
const configLoader = require('../../lib/configLoader');
const OutputFormatter = require('../../lib/output');

function parseArgs(args) {
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--scope' && args[i + 1]) {
            parsed.scope = args[++i];
        } else if (arg === '--domain' && args[i + 1]) {
            parsed.domain = args[++i];
        } else if (arg === '--port' && args[i + 1]) {
            parsed.port = parseInt(args[++i], 10);
        } else if (arg === '--no-open') {
            parsed.noOpen = true;
        } else if (arg === '--json') {
            parsed.json = true;
        } else if (arg === '--help' || arg === '-h') {
            parsed.help = true;
        }
    }
    return parsed;
}

function scopeForDomain(domain) {
    const domainScopes = {
        docs: 'docx:document:readonly docx:document',
        bitable: 'bitable:app:readonly bitable:app',
        drive: 'drive:drive:readonly drive:drive',
        wiki: 'wiki:wiki:readonly wiki:wiki',
        sheets: 'sheets:spreadsheet:readonly sheets:spreadsheet',
        calendar: 'calendar:calendar:readonly calendar:calendar',
    };

    if (domain && domainScopes[domain]) {
        return 'offline_access auth:user.id:read ' + domainScopes[domain];
    }

    return null;
}

function printUsage(subcommand) {
    const usages = {
        login: `
Usage: docpal auth login [options]

Authenticate as a Feishu user via OAuth2 to obtain a user_access_token.
This enables the CLI to operate with your personal permissions on docs and bitable.

Options:
  --scope <scopes>     Space-separated OAuth scopes (default: docs+bitable+drive+wiki)
  --domain <domain>    Authorize by business domain: docs, bitable, drive, wiki, sheets, calendar
  --port <port>        Local callback server port (default: 8401)
  --no-open            Print auth URL instead of opening browser
  --json               Output as JSON
  --help, -h           Show this help

Examples:
  docpal auth login                    # Login with all default scopes
  docpal auth login --domain docs      # Login with docs scopes only
  docpal auth login --scope "docx:document:readonly offline_access"
`,
        status: `
Usage: docpal auth status [options]

Show the current authentication state:
  - Whether logged in as a user
  - User name and ID
  - Token expiry times
  - Authorized scopes

Options:
  --json               Output as JSON
  --help, -h           Show this help
`,
        refresh: `
Usage: docpal auth refresh

Refresh the user_access_token using the stored refresh_token.
Run this if your access token has expired but the refresh token is still valid.
`,
        logout: `
Usage: docpal auth logout

Clear stored user credentials and tokens.
After logout, the CLI will fall back to bot (tenant_access_token) mode.
`,
    };

    console.log(usages[subcommand] || `
Usage: docpal auth <subcommand> [options]

Subcommands:
  login     Authenticate as a user via OAuth2
  status    Show current authentication state
  refresh   Refresh user access token
  logout    Clear stored user credentials

Use docpal auth <subcommand> --help for more details.
`);
}

async function login(args, globalArgs) {
    if (args.help) {
        printUsage('login');
        return;
    }

    const appId = configLoader.get('appId');
    if (!appId) {
        console.error('Error: APP_ID is not set. Add it to your .env file.');
        process.exit(1);
    }

    let scope = args.scope;
    if (!scope && args.domain) {
        scope = scopeForDomain(args.domain);
        if (!scope) {
            console.error(`Error: Unknown domain "${args.domain}". Valid domains: docs, bitable, drive, wiki, sheets, calendar`);
            process.exit(1);
        }
    }

    try {
        console.log('Starting Feishu OAuth2 authentication...\n');

        const result = await userAuth.login({
            scope,
            autoOpen: !args.noOpen,
            port: args.port,
        });

        if (globalArgs.outputFormat === 'json' || args.json) {
            const fmt = new OutputFormatter('json');
            fmt.render({
                user_name: result.user_name || 'Unknown',
                user_id: result.user_id || 'Unknown',
                scope: result.scope || 'N/A',
                expires_at: result.expires_at ? new Date(result.expires_at).toISOString() : null,
                refresh_expires_at: result.refresh_expires_at ? new Date(result.refresh_expires_at).toISOString() : null,
            });
        } else {
            console.log('\n Authorization successful!');
            console.log(`  User:      ${result.user_name || 'Unknown'}`);
            console.log(`  User ID:   ${result.user_id || 'Unknown'}`);
            console.log(`  Scopes:    ${result.scope || 'N/A'}`);
            console.log(`  Expires:   ${result.expires_at ? new Date(result.expires_at).toISOString() : 'N/A'}`);

            if (result.refresh_token) {
                const refreshExpires = result.refresh_expires_at
                    ? new Date(result.refresh_expires_at).toISOString()
                    : 'N/A';
                console.log(`  Refresh expires: ${refreshExpires}`);
            }

            console.log('\nYou can now use docpal with your user credentials.');
            console.log('Switch to user mode with: DOCPLA_AUTH_MODE=user or --auth user');
        }
    } catch (err) {
        console.error(`\nAuthorization failed: ${err.message}`);
        process.exit(1);
    }
}

async function status(globalArgs) {
    const statusInfo = userAuth.status();
    const larkAuth = require('../../lib/larkAuth');
    const currentMode = globalArgs && globalArgs.authMode ? globalArgs.authMode : larkAuth.getMode();

    if (globalArgs.outputFormat === 'json') {
        const fmt = new OutputFormatter('json');
        fmt.render({
            authenticated: statusInfo.authenticated,
            user_name: statusInfo.user_name,
            user_id: statusInfo.user_id,
            obtained_at: statusInfo.obtained_at,
            access_token_expired: statusInfo.access_token_expired,
            access_token_expires_at: statusInfo.access_token_expires_at,
            refresh_token_expired: statusInfo.refresh_token_expired,
            refresh_token_expires_at: statusInfo.refresh_token_expires_at,
            scope: statusInfo.scope,
            mode: currentMode,
            mode_description: currentMode === 'user' ? 'user_access_token' : 'tenant_access_token',
        });
        return;
    }

    if (!statusInfo.authenticated) {
        console.log(statusInfo.message);
        console.log(`\nCurrent mode: ${currentMode} (${currentMode === 'user' ? 'user_access_token' : 'tenant_access_token'})`);
        return;
    }

    console.log('User Authentication:');
    console.log(`  User:            ${statusInfo.user_name}`);
    console.log(`  User ID:         ${statusInfo.user_id}`);
    console.log(`  Authenticated at: ${statusInfo.obtained_at}`);
    console.log(`  Access token:    ${statusInfo.access_token_expired ? 'EXPIRED' : 'Valid'}`);
    console.log(`  Access expires:  ${statusInfo.access_token_expires_at}`);
    console.log(`  Refresh token:   ${statusInfo.refresh_token_expired ? 'EXPIRED' : 'Valid'}`);
    console.log(`  Refresh expires: ${statusInfo.refresh_token_expires_at}`);
    console.log(`  Scopes:          ${statusInfo.scope}`);
    console.log(`  Current mode:    ${currentMode} (${currentMode === 'user' ? 'user_access_token' : 'tenant_access_token'})`);
}

async function refresh() {
    try {
        console.log('Refreshing user access token...');
        const result = await userAuth.refreshTokens();
        console.log('Token refreshed successfully.');
        console.log(`  Access expires: ${result.expires_at ? new Date(result.expires_at).toISOString() : 'N/A'}`);
        if (result.refresh_expires_at) {
            console.log(`  Refresh expires: ${new Date(result.refresh_expires_at).toISOString()}`);
        }
    } catch (err) {
        console.error(`Failed to refresh token: ${err.message}`);
        console.error('Run `docpal auth login` to re-authenticate.');
        process.exit(1);
    }
}

function logout() {
    try {
        userAuth.logout();
        console.log('Logged out successfully.');
        console.log('Stored user credentials have been removed.');
        console.log('The CLI will now use bot (tenant_access_token) mode.');
    } catch (err) {
        console.error(`Failed to logout: ${err.message}`);
        process.exit(1);
    }
}

async function run(subcommand, args, globalArgs) {
    const parsed = parseArgs(args);

    switch (subcommand) {
        case 'login':
            await login(parsed, globalArgs);
            break;
        case 'status':
            await status(globalArgs);
            break;
        case 'refresh':
            await refresh();
            break;
        case 'logout':
            logout();
            break;
        default:
            printUsage();
            process.exit(1);
    }
}

module.exports = { run };