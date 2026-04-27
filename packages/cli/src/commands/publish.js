const OutputFormatter = require('../../lib/output');

async function run(subcommand, args, globalArgs) {
    const fmt = new OutputFormatter(globalArgs.outputFormat || 'text');
    fmt.progress('The `publish` command has moved. Use `docpal manual publish` instead.');
    fmt.progress('Run `docpal manual publish --help` for usage information.');

    const manualCmd = require('./manual');
    await manualCmd.run('publish', args, globalArgs);
}

module.exports = { run };