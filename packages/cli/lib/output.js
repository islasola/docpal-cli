class OutputFormatter {
  constructor(format = 'text') {
    this.format = format;
  }

  progress(msg) {
    process.stderr.write(msg + '\n');
  }

  render(data, columns) {
    if (this.format === 'json') {
      process.stdout.write(JSON.stringify(data, null, 2) + '\n');
    } else if (this.format === 'table') {
      this.printTable(Array.isArray(data) ? data : data.items || [data], columns);
    } else {
      this.printText(data, columns);
    }
  }

  printTable(rows, columns) {
    if (!rows || rows.length === 0) {
      process.stdout.write('(no results)\n');
      return;
    }

    const computed = columns.map(col => {
      if (typeof col === 'string') {
        return { key: col, label: col.toUpperCase(), width: Math.max(col.length, this._maxValueWidth(rows, col)) };
      }
      const width = col.width || Math.max(col.label.length, this._maxValueWidth(rows, col.key));
      return { key: col.key, label: col.label, width };
    });

    const header = computed.map(c => c.label.padEnd(c.width)).join('  ');
    const separator = computed.map(c => '─'.repeat(c.width)).join('──');

    process.stdout.write(header + '\n');
    process.stdout.write(separator + '\n');

    for (const row of rows) {
      const values = computed.map(c => {
        const val = this._getNestedValue(row, c.key);
        const str = val == null ? '' : String(val);
        return str.padEnd(c.width);
      });
      process.stdout.write(values.join('  ') + '\n');
    }
  }

  printText(data, columns) {
    if (this.format === 'json') return;

    if (Array.isArray(data)) {
      this._printList(data, columns);
    } else if (data.items && Array.isArray(data.items)) {
      if (data.summary) {
        this._printSummary(data.summary);
      }
      this._printList(data.items, columns);
    } else {
      this._printObject(data);
    }
  }

  _printList(items, columns) {
    for (const item of items) {
      if (columns) {
        const parts = columns.map(col => {
          const val = typeof col === 'string' ? this._getNestedValue(item, col) : this._getNestedValue(item, col.key);
          return val != null ? String(val) : '';
        });
        process.stdout.write('  ' + parts.join('  ') + '\n');
      } else {
        const name = item.name || item.Slug || item.slug || item.title || item.record_id || JSON.stringify(item);
        process.stdout.write('  ' + name + '\n');
      }
    }
  }

  _printSummary(summary) {
    const parts = Object.entries(summary).map(([k, v]) => `${k}: ${v}`);
    process.stdout.write(parts.join(', ') + '\n\n');
  }

  _printObject(obj) {
    for (const [key, value] of Object.entries(obj)) {
      if (value != null && typeof value !== 'object') {
        const label = key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
        process.stdout.write(`  ${label}: ${value}\n`);
      }
    }
  }

  _maxValueWidth(rows, key) {
    return rows.reduce((max, row) => {
      const val = this._getNestedValue(row, key);
      const len = val == null ? 0 : String(val).length;
      return Math.max(max, len);
    }, 0);
  }

  _getNestedValue(obj, path) {
    if (!path) return undefined;
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj) && 'fields' in obj) {
      return obj.fields[path];
    }
    const parts = path.split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null) return undefined;
      current = current[part];
    }
    return current;
  }
}

module.exports = OutputFormatter;