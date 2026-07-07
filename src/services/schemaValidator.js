function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function suggestSimilar(name, candidates, threshold = 3) {
  if (!candidates || candidates.length === 0) return null;
  const scored = candidates
    .map(c => ({ name: c, distance: levenshtein(name.toLowerCase(), c.toLowerCase()) }))
    .filter(c => c.distance <= threshold)
    .sort((a, b) => a.distance - b.distance);
  return scored.length > 0 ? scored[0].name : null;
}

const SQL_TYPE_COMPAT = {
  INTEGER: ['INT', 'BIGINT', 'SMALLINT', 'TINYINT', 'MEDIUMINT', 'INT4'],
  VARCHAR: ['TEXT', 'CHAR', 'CHARACTER', 'CLOB', 'MEDIUMTEXT', 'LONGTEXT', 'NVARCHAR', 'VARCHAR2'],
  DECIMAL: ['NUMERIC', 'FLOAT', 'DOUBLE', 'REAL', 'DOUBLE PRECISION', 'NUMBER'],
  BOOLEAN: ['BOOL', 'BIT'],
  TIMESTAMP: ['DATETIME', 'DATE', 'TIME', 'TIMESTAMPTZ', 'TIMESTAMP WITHOUT TIME ZONE'],
  JSON: ['JSONB'],
  SERIAL: ['BIGSERIAL', 'SMALLSERIAL', 'AUTO_INCREMENT', 'INT AUTO_INCREMENT'],
  UUID: ['UNIQUEIDENTIFIER']
};

function isTypeCompatible(colType, queryType) {
  if (!colType || !queryType) return true;
  const ct = colType.toUpperCase().replace(/\s+/g, '');
  const qt = queryType.toUpperCase().replace(/\s+/g, '');
  if (ct === qt) return true;
  for (const [base, aliases] of Object.entries(SQL_TYPE_COMPAT)) {
    const all = [base, ...aliases].map(a => a.replace(/\s+/g, ''));
    if (all.includes(ct) && all.includes(qt)) return true;
  }
  return false;
}

function extractTablesFromAST(ast) {
  const tables = new Set();
  if (!ast) return tables;

  function walk(node) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'table' && node.table) {
      tables.add(node.table);
    }

    if (node.from && Array.isArray(node.from)) {
      node.from.forEach(item => {
        if (item.table) tables.add(item.table);
      });
    }

    if (node.table && !node.type) {
      tables.add(node.table);
    }

    for (const key of Object.keys(node)) {
      if (Array.isArray(node[key])) {
        node[key].forEach(walk);
      } else if (typeof node[key] === 'object') {
        walk(node[key]);
      }
    }
  }

  if (Array.isArray(ast)) {
    ast.forEach(walk);
  } else {
    walk(ast);
  }

  return tables;
}

function extractColumnsFromAST(ast) {
  const columns = new Map();
  if (!ast) return columns;

  function walk(node, currentTable) {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'column_ref' && node.column) {
      let colName = node.column;
      if (typeof colName === 'object' && colName.expr) {
        colName = colName.expr.value || colName.expr.column || String(colName);
      }
      const table = node.table || currentTable || '_unknown_';
      if (!columns.has(table)) columns.set(table, new Set());
      columns.get(table).add(colName);
    }

    if (node.from && Array.isArray(node.from)) {
      node.from.forEach(item => {
        if (item.table) currentTable = item.table;
      });
    }

    for (const key of Object.keys(node)) {
      if (Array.isArray(node[key])) {
        node[key].forEach(item => walk(item, currentTable));
      } else if (typeof node[key] === 'object') {
        walk(node[key], currentTable);
      }
    }
  }

  if (Array.isArray(ast)) {
    ast.forEach(item => walk(item, null));
  } else {
    walk(ast, null);
  }

  return columns;
}

function validateSQLSchema(ast, schema) {
  const issues = [];
  const schemaTables = Object.keys(schema.tables || {});
  const usedTables = extractTablesFromAST(ast);
  const usedColumns = extractColumnsFromAST(ast);

  // Build lookup: both full name and short name
  const tableLookup = new Map();
  for (const t of schemaTables) {
    tableLookup.set(t, t);
    const shortName = t.includes('.') ? t.split('.').pop() : t;
    if (!tableLookup.has(shortName)) tableLookup.set(shortName, t);
  }

  for (const table of usedTables) {
    if (!tableLookup.has(table)) {
      const shortName = table.includes('.') ? table.split('.').pop() : table;
      const suggestion = suggestSimilar(shortName, schemaTables.map(t => t.includes('.') ? t.split('.').pop() : t));
      issues.push({
        type: 'error',
        category: 'schema',
        message: `Table "${table}" does not exist in schema`,
        suggestion: suggestion ? `Did you mean "${suggestion}"?` : null,
        available: schemaTables
      });
    }
  }

  for (const [table, cols] of usedColumns) {
    if (table === '_unknown_') continue;
    // Look up table by full or short name
    const fullTableName = tableLookup.get(table) || table;
    const tableSchema = schema.tables?.[fullTableName];
    if (!tableSchema) continue;

    const schemaColumns = Object.keys(tableSchema.columns || {});
    for (const col of cols) {
      if (col === '*' || col === '*.*') continue;
      if (!schemaColumns.includes(col)) {
        const suggestion = suggestSimilar(col, schemaColumns);
        issues.push({
          type: 'error',
          category: 'schema',
          message: `Column "${col}" does not exist in table "${table}"`,
          suggestion: suggestion ? `Did you mean "${suggestion}"?` : null,
          available: schemaColumns.filter(c => c !== '*')
        });
      }
    }
  }

  return issues;
}

function validateMongoSchema(ast, schema) {
  const issues = [];
  if (!schema || !schema.collections || !ast) return issues;

  const schemaCollections = Object.keys(schema.collections);

  function checkFieldName(field, collectionSchema) {
    if (!collectionSchema || !collectionSchema.fields) return;
    const schemaFields = Object.keys(collectionSchema.fields);
    if (!schemaFields.includes(field) && !field.startsWith('_')) {
      const suggestion = suggestSimilar(field, schemaFields);
      issues.push({
        type: 'warning',
        category: 'schema',
        message: `Field "${field}" not found in collection schema`,
        suggestion: suggestion ? `Did you mean "${suggestion}"?` : null,
        available: schemaFields
      });
    }
  }

  function walkFilter(obj, collectionSchema) {
    if (typeof obj !== 'object' || obj === null) return;
    for (const [key, value] of Object.entries(obj)) {
      if (!key.startsWith('$')) {
        checkFieldName(key, collectionSchema);
      }
      if (typeof value === 'object' && value !== null) {
        walkFilter(value, collectionSchema);
      }
    }
  }

  if (typeof ast === 'object' && !Array.isArray(ast)) {
    const firstCollection = schemaCollections[0];
    if (firstCollection) {
      walkFilter(ast, schema.collections[firstCollection]);
    }
  }

  return issues;
}

function validateSchema(ast, schema, dbType) {
  if (!schema) return [];

  if (dbType === 'mongodb') {
    return validateMongoSchema(ast, schema);
  }
  return validateSQLSchema(ast, schema);
}

module.exports = {
  validateSchema,
  levenshtein,
  suggestSimilar,
  isTypeCompatible
};
