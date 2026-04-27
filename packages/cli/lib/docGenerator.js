const { generateFrontMatter, sanitizeDescription } = require('./frontMatter');

class DocGenerator {
    constructor({ targets = [], addedSince = null, language = 'en' } = {}) {
        this.targets = targets.length > 0 ? targets : [];
        this.addedSince = addedSince;
        this.language = language;
    }

    generate(meta) {
        const type = (meta.type || 'concept').toLowerCase();
        switch (type) {
            case 'function':
            case 'method':
                return this._functionScaffold(meta);
            case 'class':
                return this._classScaffold(meta);
            case 'enum':
                return this._enumScaffold(meta);
            case 'guide':
            case 'tutorial':
                return this._guideScaffold(meta);
            case 'concept':
            default:
                return this._conceptScaffold(meta);
        }
    }

    generateFrontMatter(meta) {
        return generateFrontMatter({
            title: meta.title || 'Untitled',
            slug: meta.slug || '',
            description: meta.description || '',
            sidebar_position: meta.sidebarPosition || null,
            sidebar_label: meta.sidebarLabel || null,
            added_since: meta.addedSince || this.addedSince || null,
            deprecated_since: meta.deprecatedSince || null,
            keywords: meta.keywords || [],
            beta: meta.beta || false,
            type: meta.type || null,
            token: meta.token || null,
            custom: meta.custom || {},
        });
    }

    _includeStart(targets) {
        if (targets && targets.length > 0) {
            return '<include target="' + targets.join(',') + '">\n';
        }
        return '';
    }

    _includeEnd(targets) {
        if (targets && targets.length > 0) {
            return '\n</include>\n';
        }
        return '';
    }

    _conceptScaffold(meta) {
        const title = meta.title || 'Untitled';
        const description = meta.description || '<!-- TODO: Add description for ' + title + ' -->';

        let content = this.generateFrontMatter(meta) + '\n\n';
        content += '# ' + title + '\n\n';
        content += this._includeStart(meta.targets);
        content += description + '\n\n';
        content += '## Overview\n\n';
        content += '<!-- TODO: Add overview content -->\n\n';
        content += '## See Also\n\n';
        content += '<!-- TODO: Add related links -->\n';
        content += this._includeEnd(meta.targets);

        return content;
    }

    _functionScaffold(meta) {
        const title = meta.title || 'Untitled';
        const functionName = title.replace(/\(.*\)$/, '').trim();
        const description = meta.description || '<!-- TODO: Add description for ' + functionName + ' -->';

        let content = this.generateFrontMatter(meta) + '\n\n';
        content += '# ' + title + '\n\n';
        content += this._includeStart(meta.targets);
        content += description + '\n\n';

        content += '## Request Syntax\n\n';
        content += '```python\n';
        content += '<!-- TODO: Add function signature -->\n';
        content += '```\n\n';

        if (meta.params && meta.params.length > 0) {
            content += '**PARAMETERS:**\n\n';
            for (const param of meta.params) {
                const name = param.name || 'param';
                const type = param.type || 'any';
                const required = param.required ? '[REQUIRED]' : '[OPTIONAL]';
                const paramDesc = param.description || '<!-- TODO: Describe ' + name + ' -->';
                content += '- **' + name + '** (' + type + ') ' + required + ' - ' + paramDesc + '\n';
            }
            content += '\n';
        } else {
            content += '**PARAMETERS:**\n\n';
            content += '<!-- TODO: Add parameter descriptions -->\n\n';
        }

        content += '**RETURN TYPE:**\n\n';
        content += '<!-- TODO: Add return type description -->\n\n';

        content += '**EXCEPTIONS:**\n\n';
        content += '<!-- TODO: Add exception descriptions -->\n\n';

        content += '## Examples\n\n';
        content += '```python\n';
        content += '<!-- TODO: Add example for ' + functionName + ' -->\n';
        content += '```\n';
        content += this._includeEnd(meta.targets);

        return content;
    }

    _classScaffold(meta) {
        const title = meta.title || 'Untitled';
        const description = meta.description || '<!-- TODO: Add description for ' + title + ' -->';

        let content = this.generateFrontMatter(meta) + '\n\n';
        content += '# ' + title + '\n\n';
        content += this._includeStart(meta.targets);
        content += description + '\n\n';

        content += '## Overview\n\n';
        content += '<!-- TODO: Add class overview -->\n\n';

        content += '## Constructor\n\n';
        content += '<!-- TODO: Add constructor details -->\n\n';

        content += '## Methods\n\n';
        content += '<!-- TODO: Add method list -->\n';
        content += this._includeEnd(meta.targets);

        return content;
    }

    _enumScaffold(meta) {
        const title = meta.title || 'Untitled';
        const description = meta.description || '<!-- TODO: Add description for ' + title + ' -->';

        let content = this.generateFrontMatter(meta) + '\n\n';
        content += '# ' + title + '\n\n';
        content += this._includeStart(meta.targets);
        content += description + '\n\n';

        content += '## Values\n\n';
        content += '| Value | Description |\n';
        content += '|-------|-------------|\n';

        if (meta.values && meta.values.length > 0) {
            for (const val of meta.values) {
                const valDesc = val.description || '<!-- TODO: Describe ' + val.name + ' -->';
                content += '| `' + val.name + '` | ' + valDesc + ' |\n';
            }
        } else {
            content += '<!-- TODO: Add enum values -->\n';
        }

        content += '\n';
        content += this._includeEnd(meta.targets);

        return content;
    }

    _guideScaffold(meta) {
        const title = meta.title || 'Untitled';
        const description = meta.description || '<!-- TODO: Add description for ' + title + ' -->';

        let content = this.generateFrontMatter(meta) + '\n\n';
        content += '# ' + title + '\n\n';
        content += this._includeStart(meta.targets);
        content += description + '\n\n';

        content += '## Prerequisites\n\n';
        content += '<!-- TODO: Add prerequisites -->\n\n';

        content += '## Steps\n\n';
        content += '<!-- TODO: Add step-by-step instructions -->\n\n';

        content += '## Troubleshooting\n\n';
        content += '<!-- TODO: Add troubleshooting tips -->\n';
        content += this._includeEnd(meta.targets);

        return content;
    }
}

module.exports = DocGenerator;