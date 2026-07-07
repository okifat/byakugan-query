function tuneSQL(ast, query, dbType) {
  const suggestions = [];
  const upper = query.toUpperCase();

  // ---- Rewrite Suggestions ----

  // Subquery to JOIN
  if (upper.includes('WHERE') && upper.includes('IN') && upper.includes('SELECT')) {
    suggestions.push({
      type: 'rewrite',
      title: 'Consider using JOIN instead of IN subquery',
      detail: 'IN subqueries can be slow on large tables. A JOIN or EXISTS is often more efficient.',
      example: '-- Instead of:\nSELECT * FROM orders WHERE user_id IN (SELECT id FROM users WHERE active = 1)\n\n-- Use:\nSELECT o.* FROM orders o INNER JOIN users u ON o.user_id = u.id WHERE u.active = 1'
    });
  }

  // NOT IN to NOT EXISTS
  if (upper.includes('NOT IN') && upper.includes('SELECT')) {
    suggestions.push({
      type: 'rewrite',
      title: 'Use NOT EXISTS instead of NOT IN',
      detail: 'NOT IN returns empty result if subquery contains NULL. NOT EXISTS is safer and often faster.',
      example: '-- Instead of:\nSELECT * FROM t1 WHERE id NOT IN (SELECT id FROM t2)\n\n-- Use:\nSELECT * FROM t1 t WHERE NOT EXISTS (SELECT 1 FROM t2 WHERE t2.id = t.id)'
    });
  }

  // OR to UNION ALL
  const orCount = (upper.match(/\bOR\b/g) || []).length;
  if (orCount >= 3) {
    suggestions.push({
      type: 'rewrite',
      title: 'Multiple OR conditions — consider UNION ALL',
      detail: `${orCount} OR conditions detected. UNION ALL can use indexes better and avoid full table scan.`,
      example: '-- Instead of:\nSELECT * FROM t WHERE col = 1 OR col = 2 OR col = 3\n\n-- Use:\nSELECT * FROM t WHERE col = 1\nUNION ALL\nSELECT * FROM t WHERE col = 2\nUNION ALL\nSELECT * FROM t WHERE col = 3'
    });
  }

  // LIKE with leading wildcard to FULLTEXT
  if (upper.includes("LIKE '%") || upper.includes('LIKE "%')) {
    suggestions.push({
      type: 'rewrite',
      title: 'Leading wildcard prevents index usage',
      detail: 'LIKE "%term%" cannot use B-tree index. Consider FULLTEXT index or trigram index.',
      example: dbType === 'postgresql'
        ? "-- Use pg_trgm GIN index:\nCREATE INDEX idx_name_gin ON users USING GIN (name gin_trgm_ops);\n-- Then: WHERE name % 'search term'"
        : dbType === 'mysql'
        ? "-- Use FULLTEXT index:\nALTER TABLE users ADD FULLTEXT INDEX ft_name (name);\n-- Then: WHERE MATCH(name) AGAINST('search term')"
        : "-- Use $text index:\ndb.users.createIndex({ name: 'text' })\n-- Then: { $text: { $search: 'search term' } }"
    });
  }

  // Correlated subquery
  if (upper.includes('WHERE') && upper.includes('EXISTS') && upper.includes('SELECT')) {
    const correlated = /WHERE\s+\w+\.\w+\s*=\s*\w+\.\w+/i.test(query);
    if (correlated) {
      suggestions.push({
        type: 'rewrite',
        title: 'Correlated subquery detected — consider JOIN',
        detail: 'Correlated subqueries execute once per row. A JOIN processes all rows in one pass.',
        example: '-- Consider rewriting as a JOIN or lateral join for better performance'
      });
    }
  }

  // DISTINCT with JOIN (often unnecessary)
  if (upper.includes('DISTINCT') && upper.includes('JOIN')) {
    suggestions.push({
      type: 'rewrite',
      title: 'DISTINCT with JOIN may indicate missing relationship',
      detail: 'If JOIN produces duplicates, check if the join condition is correct. DISTINCT adds sorting overhead.',
      example: '-- Check if JOIN condition is correct, or use GROUP BY instead of DISTINCT'
    });
  }

  // UNION to UNION ALL
  if (upper.includes('UNION') && !upper.includes('UNION ALL')) {
    suggestions.push({
      type: 'rewrite',
      title: 'Use UNION ALL if duplicates are acceptable',
      detail: 'UNION removes duplicates (requires sorting). UNION ALL is faster if you know there are no duplicates or duplicates are OK.',
      example: '-- Replace:\nSELECT col FROM t1 UNION SELECT col FROM t2\n\n-- With (if duplicates OK):\nSELECT col FROM t1 UNION ALL SELECT col FROM t2'
    });
  }

  // ---- Index Recommendations ----
  const indexCols = extractIndexCandidates(ast);

  if (indexCols.where.length > 0) {
    suggestions.push({
      type: 'index',
      title: 'Add index on WHERE columns',
      detail: `Columns: ${indexCols.where.join(', ')}`,
      example: `CREATE INDEX idx_${indexCols.where.join('_')} ON <table> (${indexCols.where.join(', ')});`
    });
  }

  if (indexCols.join.length > 0) {
    suggestions.push({
      type: 'index',
      title: 'Add index on JOIN columns',
      detail: `Columns: ${indexCols.join.join(', ')}`,
      example: `CREATE INDEX idx_${indexCols.join.join('_')} ON <table> (${indexCols.join.join(', ')});`
    });
  }

  if (indexCols.order.length > 0) {
    suggestions.push({
      type: 'index',
      title: 'Add index on ORDER BY columns',
      detail: `Columns: ${indexCols.order.join(', ')}`,
      example: `CREATE INDEX idx_${indexCols.order.join('_')} ON <table> (${indexCols.order.join(', ')});`
    });
  }

  if (indexCols.where.length >= 2) {
    suggestions.push({
      type: 'index',
      title: 'Consider composite index',
      detail: `Combine WHERE columns into one composite index: ${indexCols.where.join(', ')}`,
      example: `CREATE INDEX idx_composite ON <table> (${indexCols.where.join(', ')});`
    });
  }

  // ---- General Tips ----

  if (upper.includes('SELECT *') || upper.includes('SELECT *,')) {
    suggestions.push({
      type: 'tip',
      title: 'Avoid SELECT *',
      detail: 'Fetch only the columns you need. Reduces I/O, memory, and network usage.'
    });
  }

  if (upper.startsWith('SELECT') && !upper.includes('LIMIT') &&
      !upper.includes('COUNT') && !upper.includes('SUM') && !upper.includes('AVG') &&
      !upper.includes('INSERT') && !upper.includes('CREATE')) {
    suggestions.push({
      type: 'tip',
      title: 'Add LIMIT to prevent unbounded results',
      detail: 'Without LIMIT, a query may return millions of rows and exhaust memory.'
    });
  }

  if (upper.includes('WHERE') && upper.match(/FUNCTION\(\w+\)/)) {
    suggestions.push({
      type: 'tip',
      title: 'Avoid functions on indexed columns in WHERE',
      detail: 'WHERE UPPER(name) = \'JOHN\' cannot use index on name. Use a functional index or rewrite the condition.'
    });
  }

  if (upper.includes('INSERT') && upper.includes('VALUES') && upper.includes('),')) {
    suggestions.push({
      type: 'tip',
      title: 'Use batch INSERT for multiple rows',
      detail: 'Single INSERT with multiple VALUES is faster than multiple INSERT statements.'
    });
  }

  if (upper.includes('UPDATE') && upper.includes('WHERE') && upper.includes('JOIN')) {
    suggestions.push({
      type: 'tip',
      title: 'Be cautious with JOIN-based UPDATE',
      detail: 'JOIN-based UPDATE can affect more rows than expected. Verify the JOIN condition.'
    });
  }

  if (upper.startsWith('DELETE') && upper.includes('WHERE')) {
    const deleteLimit = upper.includes('LIMIT');
    if (!deleteLimit && dbType === 'mysql') {
      suggestions.push({
        type: 'tip',
        title: 'Add LIMIT to DELETE for safety',
        detail: 'Large deletes can lock tables. Use LIMIT and delete in batches.'
      });
    }
  }

  // Check for potential N+1 pattern hints
  if (upper.includes('SELECT') && upper.includes('WHERE') && upper.includes('IN')) {
    suggestions.push({
      type: 'tip',
      title: 'Possible N+1 pattern',
      detail: 'If this query is called in a loop with different values, consider fetching all needed data in one query.'
    });
  }

  return suggestions;
}

function tuneMongo(pipeline, query) {
  const suggestions = [];

  if (Array.isArray(pipeline)) {
    const hasMatch = pipeline.some(s => s.$match);
    const hasSort = pipeline.some(s => s.$sort);
    const hasGroup = pipeline.some(s => s.$group);
    const hasLookup = pipeline.some(s => s.$lookup);
    const hasLimit = pipeline.some(s => s.$limit);
    const matchIndex = pipeline.findIndex(s => s.$match);
    const sortIndex = pipeline.findIndex(s => s.$sort);

    // Rewrite
    if (hasLookup && hasGroup) {
      suggestions.push({
        type: 'rewrite',
        title: 'Consider embedding instead of $lookup',
        detail: 'If data is accessed together frequently, embedding references may be more efficient than $lookup.'
      });
    }

    if (hasSort && hasLimit && sortIndex > pipeline.findIndex(s => s.$limit)) {
      suggestions.push({
        type: 'rewrite',
        title: '$sort should come before $limit',
        detail: 'Sorting after limiting gives incorrect results. Move $sort before $limit.'
      });
    }

    // Index
    if (hasMatch && matchIndex === 0) {
      const matchStage = pipeline[0].$match;
      const fields = Object.keys(matchStage).filter(k => !k.startsWith('$'));
      if (fields.length > 0) {
        suggestions.push({
          type: 'index',
          title: 'Create index on filtered fields',
          detail: `Fields: ${fields.join(', ')}`,
          example: `db.${getLastCollection(pipeline)}.createIndex({ ${fields.map(f => `"${f}": 1`).join(', ')} })`
        });
      }
    }

    // Tips
    if (!hasMatch && pipeline.length > 1) {
      suggestions.push({
        type: 'tip',
        title: 'Add $match at the start of pipeline',
        detail: 'Early filtering reduces documents processed by subsequent stages.'
      });
    }

    if (hasGroup && !hasMatch) {
      suggestions.push({
        type: 'tip',
        title: 'Filter before $group to reduce memory usage',
        detail: '$group processes all documents if no preceding $match.'
      });
    }

    if (hasLookup) {
      suggestions.push({
        type: 'tip',
        title: 'Ensure lookup fields are indexed',
        detail: 'Both localField and foreignField in $lookup should have indexes for performance.'
      });
    }
  }

  return suggestions;
}

function extractIndexCandidates(ast) {
  const result = { where: [], join: [], order: [] };
  if (!ast) return result;

  function walk(node) {
    if (!node || typeof node !== 'object') return;

    // WHERE columns
    if (node.type === 'binary_expr' && node.operator && ['=', '>', '<', '>=', '<=', 'LIKE', 'IN'].includes(node.operator)) {
      if (node.left?.type === 'column_ref') {
        const col = typeof node.left.column === 'object' ? node.left.column.expr?.value : node.left.column;
        if (col && col !== '*') result.where.push(col);
      }
    }

    // ORDER BY columns
    if (node.type === 'order_by' && node.orderby) {
      node.orderby.forEach(item => {
        if (item.expr?.type === 'column_ref') {
          const col = typeof item.expr.column === 'object' ? item.expr.column.expr?.value : item.expr.column;
          if (col) result.order.push(col);
        }
      });
    }

    for (const key of Object.keys(node)) {
      if (Array.isArray(node[key])) {
        node[key].forEach(walk);
      } else if (typeof node[key] === 'object') {
        walk(node[key]);
      }
    }
  }

  walk(ast);

  // Deduplicate
  result.where = [...new Set(result.where)];
  result.join = [...new Set(result.join)];
  result.order = [...new Set(result.order)];

  return result;
}

function getLastCollection(pipeline) {
  for (const stage of pipeline) {
    if (stage.$match) {
      const keys = Object.keys(stage.$match).filter(k => !k.startsWith('$'));
      if (keys.length > 0) return 'collection';
    }
  }
  return 'collection';
}

function tune(ast, query, dbType) {
  if (dbType === 'mongodb') {
    return tuneMongo(ast, query);
  }
  return tuneSQL(ast, query, dbType);
}

module.exports = { tune };
