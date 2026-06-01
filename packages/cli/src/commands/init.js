const bitableClient = require('../../lib/bitableClient');
const configLoader = require('../../lib/configLoader');
const { TABLE_SCHEMAS, LINK_FIELDS, MANUALS_TABLE } = require('../../lib/tableSchemas');

function parseArgs(args) {
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--base' && args[i + 1]) {
            parsed.baseToken = args[++i];
        } else if (arg === '--name' && args[i + 1]) {
            parsed.name = args[++i];
        } else if (arg === '--dry-run') {
            parsed.dryRun = true;
        } else if (arg === '--force') {
            parsed.force = true;
        } else if (arg === '--json') {
            parsed.json = true;
        } else if (arg === '--help' || arg === '-h') {
            parsed.help = true;
        }
    }
    return parsed;
}

function printUsage() {
    console.log(`
Usage: docpal init [options]

Initialize DocPal by creating a new bitable or connecting to an existing one.

Options:
  --base <token>    Connect to an existing bitable (skips creation)
  --name <name>     Name for the new bitable (default: "DocPal")
  --force           Create a new bitable even if BASE_TOKEN is already set
  --dry-run         Preview without creating
  --json            Output as JSON
  --help, -h        Show this help

Examples:
  docpal init                     Create a new bitable named "DocPal"
  docpal init --name "My Docs"    Create a new bitable with custom name
  docpal init --base bascnXXX     Connect to an existing bitable
`);
}

async function ensureTables(baseToken, output) {
    const created = [];
    const skipped = [];
    const tableIds = {};

    for (const schema of TABLE_SCHEMAS) {
        try {
            const result = await bitableClient.ensureTable(baseToken, schema.name, schema.fields);
            const tableId = result.table_id || result.table?.table_id;
            tableIds[schema.name] = tableId;

            if (result._existed) {
                skipped.push(schema.name);
            } else {
                created.push(schema.name);
            }
        } catch (err) {
            output.progress(`  Warning: Failed to ensure table ${schema.name}: ${err.message}`);
        }
    }

    for (const lf of LINK_FIELDS) {
        const tableId = tableIds[lf.table];
        const linkedTableId = tableIds[lf.linked_table];
        if (!tableId || !linkedTableId) {
            output.progress(`  Skipping Link field ${lf.field_name}: table_id not found`);
            continue;
        }

        try {
            await bitableClient.createField(baseToken, tableId, {
                field_name: lf.field_name,
                type: lf.type || 21,
                property: { table_id: linkedTableId, multiple: lf.multiple }
            });
            output.progress(`  Created Link field: ${lf.table}.${lf.field_name} → ${lf.linked_table}`);
        } catch (err) {
            if (err.message && (err.message.includes('already exist') || err.message.includes('FieldNameDuplicated'))) {
                // Field already exists, skip
            } else {
                output.progress(`  Warning: Failed to create Link field ${lf.field_name}: ${err.message}`);
            }
        }
    }

    return { created, skipped, tableIds };
}

async function run(subcommand, args, globalArgs) {
    const parsed = parseArgs(args);
    const output = globalArgs.output || new (require('../../lib/output'))(globalArgs.outputFormat || 'text');

    if (parsed.help) {
        printUsage();
        return;
    }

    const OutputFormatter = require('../../lib/output');
    const fmt = new OutputFormatter(globalArgs.outputFormat || 'text');

    let baseToken;
    let action;

    if (parsed.baseToken) {
        if (parsed.dryRun) {
            fmt.progress(`[DRY RUN] Would connect to existing bitable: ${parsed.baseToken}`);
            fmt.render({ base_token: parsed.baseToken, action: 'connect', dry_run: true });
            return;
        }

        baseToken = parsed.baseToken;
        action = 'connect';
        fmt.progress(`Connecting to existing bitable: ${baseToken}`);
    } else {
        const existingToken = configLoader.getBaseToken();

        if (existingToken && !parsed.force) {
            if (parsed.dryRun) {
                fmt.progress(`[DRY RUN] Would use existing bitable: ${existingToken}`);
                fmt.render({ base_token: existingToken, action: 'ensure', dry_run: true });
                return;
            }

            baseToken = existingToken;
            action = 'ensure';
            fmt.progress(`Using existing bitable: ${baseToken}`);
        } else {
            const name = parsed.name || 'DocPal';

            if (parsed.dryRun) {
                fmt.progress(`[DRY RUN] Would create new bitable: "${name}"`);
                fmt.render({ name, action: 'create', dry_run: true });
                return;
            }

            fmt.progress(`Creating bitable: "${name}"`);

            try {
                const newBase = await bitableClient.createBase(name, '');
                baseToken = newBase.app?.app_token || newBase.app_token || newBase.app?.token;

                if (!baseToken) {
                    throw new Error('Failed to get app_token from created bitable');
                }

                fmt.progress(`Created bitable: ${baseToken}`);
                action = 'created';
            } catch (err) {
                console.error(`Failed to create bitable: ${err.message}`);
                process.exit(1);
            }
        }
    }

    fmt.progress('Ensuring tables exist...');

    try {
        const { created, skipped, tableIds } = await ensureTables(baseToken, fmt);

        if (created.length > 0) {
            fmt.progress(`  Created tables: ${created.join(', ')}`);
        }
        if (skipped.length > 0) {
            fmt.progress(`  Already exist: ${skipped.join(', ')}`);
        }
    } catch (err) {
        console.error(`Failed to ensure tables: ${err.message}`);
        process.exit(1);
    }

    configLoader.saveBaseToken(baseToken);
    fmt.progress(`Saved BASE_TOKEN to .env`);

    const result = {
        base_token: baseToken,
        action: action,
        tables: TABLE_SCHEMAS.map(s => s.name),
    };

    fmt.render(result, [
        { key: 'base_token', label: 'BASE TOKEN' },
        { key: 'action', label: 'ACTION' },
    ]);

    fmt.progress('\nDocPal is ready! Next steps:');
    fmt.progress('  1. Run `docpal manual create --name <name> --root-type wiki --root <token>`');
    fmt.progress('  2. Run `docpal manual list` to see your manuals');
}

module.exports = { run, ensureTables, TABLE_SCHEMAS, LINK_FIELDS };