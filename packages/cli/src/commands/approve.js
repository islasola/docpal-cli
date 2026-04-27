const OutputFormatter = require('../../lib/output');

async function run(subcommand, args, globalArgs) {
    const fmt = new OutputFormatter(globalArgs.outputFormat || 'text');
    fmt.progress('The `approve` command has moved. Use `docpal manual approve` instead.');
    fmt.progress('Run `docpal manual approve --help` for usage information.');

    const manualCmd = require('./manual');
    const manualArgs = ['approve', ...args];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--manual' && args[i + 1]) {
            // Already using --manual, forward directly
        }
        // Convert --doc <slug> to --slug <slug> for manual approve
        if (args[i] === '--doc' && args[i + 1]) {
            manualArgs[i + 1 + 1] = args[i + 1]; // will be handled in manual.js parseArgs
        }
    }

    await manualCmd.run('approve', args, globalArgs);
}

module.exports = { run };