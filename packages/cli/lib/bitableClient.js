const { feishuRequest } = require('./feishuClient');

const FEISHU_HOST = process.env.FEISHU_HOST || 'https://open.feishu.cn';

class BitableClient {
  constructor() {
    this._tableIdCache = {};
  }

  _cacheKey(baseToken, name) {
    return `${baseToken}:${name}`;
  }

  async _resolveTableId(baseToken, tableIdOrName) {
    if (!tableIdOrName) return tableIdOrName;

    const cacheKey = this._cacheKey(baseToken, tableIdOrName);
    if (this._tableIdCache[cacheKey]) {
      return this._tableIdCache[cacheKey];
    }

    console.log(`[bitable] Resolving table ID for "${tableIdOrName}"...`);
    const existing = await this.listTables(baseToken);
    const items = existing.items || existing.data?.items || [];

    for (const table of items) {
      const id = table.table_id || table.table?.table_id;
      const name = table.name;
      if (id && name) {
        this._tableIdCache[this._cacheKey(baseToken, name)] = id;
        this._tableIdCache[this._cacheKey(baseToken, id)] = id;
      }
    }

    const resolved = this._tableIdCache[cacheKey];
    if (resolved) {
      console.log(`[bitable] Resolved "${tableIdOrName}" -> "${resolved}"`);
      return resolved;
    }

    console.log(`[bitable] Could not resolve "${tableIdOrName}", using as-is`);
    return tableIdOrName;
  }

  async request(method, path, body, options = {}) {
    return feishuRequest(method, path, body, options);
  }

  async createBase(name, folderToken) {
    return this.request('POST', '/open-apis/bitable/v1/apps', {
      name,
      folder_token: folderToken
    });
  }

  async listTables(baseToken) {
    return this.request('GET', `/open-apis/bitable/v1/apps/${baseToken}/tables`);
  }

  async createTable(baseToken, name, fields = []) {
    return this.request('POST', `/open-apis/bitable/v1/apps/${baseToken}/tables`, {
      table: {
        name,
        table_id: name,
        fields
      }
    });
  }

  async ensureTable(baseToken, name, fields = [], linkFields = []) {
    const existing = await this.listTables(baseToken);
    const items = existing.items || existing.data?.items || [];
    let table = items.find(t => t.name === name);

    if (!table) {
      table = await this.createTable(baseToken, name, fields);
    }

    if (table && linkFields && linkFields.length > 0) {
      const tableId = table.table_id || table.table?.table_id;
      if (tableId) {
        const existingFields = await this.listFields(baseToken, tableId);
        const existingNames = (existingFields.items || []).map(f => f.field_name);

        for (const lf of linkFields) {
          if (!existingNames.includes(lf.field_name)) {
            await this.createField(baseToken, tableId, lf);
          }
        }
      }
    }

    return table;
  }

  async findManualByName(baseToken, name) {
    const records = await this.listRecords(baseToken, 'tblManuals');
    const items = records.items || [];
    return items.find(r => r.fields.Name === name) || null;
  }

  async resolveManual(baseToken, manualName) {
    if (!manualName) {
      const records = await this.listRecords(baseToken, 'tblManuals');
      const items = records.items || [];
      if (items.length === 0) {
        throw new Error('No manuals found. Run `docpal manual create` first.');
      }
      if (items.length === 1) {
        return items[0];
      }
      const names = items.map(r => r.fields.Name).join(', ');
      throw new Error(`Multiple manuals found (${names}). Specify --manual <name>.`);
    }

    const manual = await this.findManualByName(baseToken, manualName);
    if (!manual) {
      throw new Error(`Manual "${manualName}" not found. Run \`docpal manual list\` to see available manuals.`);
    }
    return manual;
  }

  async listFields(baseToken, tableId) {
    const resolvedId = await this._resolveTableId(baseToken, tableId);
    return this.request('GET', `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedId}/fields`);
  }

  async createField(baseToken, tableId, field) {
    const resolvedId = await this._resolveTableId(baseToken, tableId);
    return this.request('POST', `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedId}/fields`, {
      field_name: field.field_name,
      type: field.type,
      property: field.property || {}
    });
  }

  async listViews(baseToken, tableId) {
    const resolvedId = await this._resolveTableId(baseToken, tableId);
    return this.request('GET', `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedId}/views`);
  }

  async createView(baseToken, tableId, viewConfig) {
    const resolvedId = await this._resolveTableId(baseToken, tableId);
    return this.request('POST', `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedId}/views`, viewConfig);
  }

  async listRecords(baseToken, tableId, options = {}) {
    const resolvedId = await this._resolveTableId(baseToken, tableId);
    const params = new URLSearchParams();
    if (options.viewId) params.append('view_id', options.viewId);
    if (options.filter) params.append('filter', JSON.stringify(options.filter));
    if (options.pageSize) params.append('page_size', options.pageSize);
    if (options.pageToken) params.append('page_token', options.pageToken);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request('GET', `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedId}/records${query}`);
  }

  /**
   * List all records with auto-pagination.
   * @param {string} baseToken
   * @param {string} tableId
   * @param {Object} options
   * @returns {Promise<{ items: Object[] }>}
   */
  async listAllRecords(baseToken, tableId, options = {}) {
    const allItems = [];
    let pageToken = undefined;
    const pageSize = options.pageSize || 500;
    do {
      const result = await this.listRecords(baseToken, tableId, {
        ...options,
        pageSize,
        pageToken,
      });
      const items = result.items || [];
      allItems.push(...items);
      const nextToken = result.page_token || result.pageToken;
      const hasMore = result.has_more || result.hasMore;
      if (nextToken === pageToken) break;
      pageToken = nextToken;
      if (!hasMore) break;
    } while (pageToken);
    return { items: allItems };
  }

  async createRecord(baseToken, tableId, fields) {
    const resolvedId = await this._resolveTableId(baseToken, tableId);
    return this.request('POST', `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedId}/records`, {
      fields
    });
  }

  async batchCreateRecords(baseToken, tableId, records) {
    const resolvedId = await this._resolveTableId(baseToken, tableId);
    return this.request('POST', `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedId}/records/batch_create`, {
      records
    });
  }

  async updateRecord(baseToken, tableId, recordId, fields) {
    const resolvedId = await this._resolveTableId(baseToken, tableId);
    return this.request('PUT', `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedId}/records/${recordId}`, {
      fields
    });
  }

  async batchUpdateRecords(baseToken, tableId, records) {
    const resolvedId = await this._resolveTableId(baseToken, tableId);
    return this.request('POST', `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedId}/records/batch_update`, {
      records
    });
  }

  async deleteRecord(baseToken, tableId, recordId) {
    const resolvedId = await this._resolveTableId(baseToken, tableId);
    return this.request('DELETE', `/open-apis/bitable/v1/apps/${baseToken}/tables/${resolvedId}/records/${recordId}`);
  }

  async searchRecords(baseToken, tableId, filter) {
    return this.listRecords(baseToken, tableId, { filter });
  }
}

module.exports = new BitableClient();
