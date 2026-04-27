class DiffEngine {
    constructor({ categoryMap = {} } = {}) {
        this.categoryMap = categoryMap;
        this.categoryMapLower = {};
        for (const [key, value] of Object.entries(categoryMap)) {
            this.categoryMapLower[key.toLowerCase()] = value;
        }
    }

    diff(sourceDocs, indexedDocs) {
        const sourceBySlug = this._indexBySlug(sourceDocs);
        const docsBySlug = this._indexBySlug(indexedDocs);
        const docsBySlugLower = this._indexBySlugLower(indexedDocs);

        const actions = [];
        const matchedSlugs = new Set();

        for (const [slug, sourceDoc] of sourceBySlug) {
            const doc = docsBySlug.get(slug)
                || docsBySlugLower.get(slug.toLowerCase())
                || docsBySlug.get(this._remapSlug(slug))
                || docsBySlugLower.get(this._remapSlug(slug).toLowerCase());

            if (!doc) {
                actions.push({
                    type: 'CREATE',
                    doc: sourceDoc,
                    slug,
                    reason: 'New document not found in index'
                });
                continue;
            }

            const matchedSlug = doc.metadata?.slug || doc.slug || slug;
            matchedSlugs.add(matchedSlug);
            matchedSlugs.add(matchedSlug.toLowerCase());

            if (this._isDeprecated(sourceDoc)) {
                actions.push({
                    type: 'DEPRECATE',
                    doc: sourceDoc,
                    slug,
                    indexedDoc: doc,
                    reason: `Document marked as deprecated: ${this._deprecationNote(sourceDoc)}`
                });
            } else if (this._hasChanges(sourceDoc, doc)) {
                actions.push({
                    type: 'UPDATE',
                    doc: sourceDoc,
                    slug,
                    indexedDoc: doc,
                    reason: this._describeChanges(sourceDoc, doc)
                });
            } else {
                actions.push({
                    type: 'SKIP',
                    doc: sourceDoc,
                    slug,
                    indexedDoc: doc,
                    reason: 'No changes detected'
                });
            }
        }

        for (const [slug, doc] of docsBySlug) {
            if (!matchedSlugs.has(slug) && !matchedSlugs.has(slug.toLowerCase())) {
                actions.push({
                    type: 'ORPHAN',
                    doc: null,
                    slug,
                    indexedDoc: doc,
                    reason: `Indexed document has no matching source: ${slug}`
                });
            }
        }

        return actions;
    }

    getSummary(actions) {
        const summary = { create: 0, update: 0, deprecate: 0, skip: 0, orphan: 0 };
        for (const action of actions) {
            const key = action.type.toLowerCase();
            if (key in summary) summary[key]++;
        }
        return summary;
    }

    filterByType(actions, ...types) {
        const typeSet = new Set(types.map(t => t.toUpperCase()));
        return actions.filter(a => typeSet.has(a.type));
    }

    _indexBySlug(docs) {
        const map = new Map();
        for (const doc of docs) {
            const slug = doc.metadata?.slug || doc.slug || '';
            if (slug) map.set(slug, doc);
        }
        return map;
    }

    _indexBySlugLower(docs) {
        const map = new Map();
        for (const doc of docs) {
            const slug = (doc.metadata?.slug || doc.slug || '').toLowerCase();
            if (slug) map.set(slug, doc);
        }
        return map;
    }

    _remapSlug(slug) {
        return this.categoryMap[slug] || this.categoryMapLower[slug.toLowerCase()] || slug;
    }

    _isDeprecated(doc) {
        const meta = doc.metadata || {};
        if (meta.deprecated_since || meta.deprecatedSince) return true;
        if (meta.status === 'Deprecated' || meta.status === 'deprecated') return true;
        if (meta.deprecated === true || meta.deprecated === 'true') return true;
        const tags = meta.tags || [];
        if (tags.some(t => (typeof t === 'string' ? t.toLowerCase() : '').includes('deprecated'))) return true;
        return false;
    }

    _deprecationNote(doc) {
        const meta = doc.metadata || {};
        return meta.deprecated_since || meta.deprecatedSince || meta.deprecated || 'deprecated';
    }

    _hasChanges(sourceDoc, indexedDoc) {
        const sourceDesc = this._firstLine(this._description(sourceDoc));
        const indexedDesc = this._firstLine(this._description(indexedDoc));
        if (sourceDesc !== indexedDesc) return true;

        const sourceSha = sourceDoc.contentHash || sourceDoc.metadata?.contentHash;
        const indexedSha = indexedDoc.contentHash || indexedDoc.metadata?.contentHash;
        if (sourceSha && indexedSha && sourceSha !== indexedSha) return true;

        const sourceModified = sourceDoc.lastModified || sourceDoc.metadata?.lastModified;
        const indexedModified = indexedDoc.lastModified || indexedDoc.metadata?.lastModified;
        if (sourceModified && indexedModified && sourceModified !== indexedModified) return true;

        return false;
    }

    _describeChanges(sourceDoc, indexedDoc) {
        const changes = [];
        const sourceDesc = this._firstLine(this._description(sourceDoc));
        const indexedDesc = this._firstLine(this._description(indexedDoc));
        if (sourceDesc !== indexedDesc) changes.push('Description changed');

        const sourceSha = sourceDoc.contentHash || sourceDoc.metadata?.contentHash;
        const indexedSha = indexedDoc.contentHash || indexedDoc.metadata?.contentHash;
        if (sourceSha && indexedSha && sourceSha !== indexedSha) changes.push('Content hash changed');

        const sourceModified = sourceDoc.lastModified || sourceDoc.metadata?.lastModified;
        const indexedModified = indexedDoc.lastModified || indexedDoc.metadata?.lastModified;
        if (sourceModified && indexedModified && sourceModified !== indexedModified) {
            changes.push(`Source modified at ${sourceModified}, index at ${indexedModified}`);
        }

        return changes.length > 0 ? changes.join('; ') : 'Content updated';
    }

    _description(doc) {
        const meta = doc.metadata || {};
        return meta.description || doc.description || '';
    }

    _firstLine(text) {
        if (!text) return '';
        return text.split('\n')[0].trim();
    }
}

module.exports = DiffEngine;