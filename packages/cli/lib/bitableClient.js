const fetch = require('node-fetch');
const larkAuth = require('./larkAuth');

const FEISHU_HOST = process.env.FEISHU_HOST || 'https://open.feishu.cn';

class BitableClient {
  async request(method, path, body, options = {}) {
    const headers = await larkAuth.headers();
    const url = `${FEISHU_HOST}${path}`;

    const res = await fetch(url, {
      method,
      headers: {
        ...headers,
        ...(options.headers || {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });

    const data = await res.json();

    if (data.code !== 0 && data.code !== undefined) {
      throw new Error(`Bitable API error: ${data.msg} (code: ${data.code})`);
    }

    return data.data || data;
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
    const records = await this.searchRecords(baseToken, 'tblManuals', {
      conditions: [{ field_name: 'Name', operator: 'is', value: [name] }]
    });
    return records.items?.[0] || null;
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
    return this.request('GET', `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/fields`);
  }

  async createField(baseToken, tableId, field) {
    return this.request('POST', `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/fields`, {
      field_name: field.field_name,
      type: field.type,
      property: field.property || {}
    });
  }

  async listRecords(baseToken, tableId, options = {}) {
    const params = new URLSearchParams();
    if (options.viewId) params.append('view_id', options.viewId);
    if (options.filter) params.append('filter', JSON.stringify(options.filter));
    if (options.pageSize) params.append('page_size', options.pageSize);
    if (options.pageToken) params.append('page_token', options.pageToken);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request('GET', `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records${query}`);
  }

  async createRecord(baseToken, tableId, fields) {
    return this.request('POST', `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records`, {
      fields
    });
  }

  async updateRecord(baseToken, tableId, recordId, fields) {
    return this.request('PUT', `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records/${recordId}`, {
      fields
    });
  }

  async deleteRecord(baseToken, tableId, recordId) {
    return this.request('DELETE', `/open-apis/bitable/v1/apps/${baseToken}/tables/${tableId}/records/${recordId}`);
  }

  async searchRecords(baseToken, tableId, filter) {
    return this.listRecords(baseToken, tableId, { filter });
  }
}

module.exports = new BitableClient();