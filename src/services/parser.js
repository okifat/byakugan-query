const { Parser } = require('node-sql-parser');

const parser = new Parser();

function levenshteinSimple(a, b) {
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

function parseSQL(query, dbType) {
  try {
    const ast = parser.astify(query, { database: dbType });
    return { valid: true, ast, errors: [] };
  } catch (err) {
    const message = err.message || 'Unknown parse error';
    const lineMatch = message.match(/line (\d+)/i);
    const colMatch = message.match(/column (\d+)/i);
    return {
      valid: false,
      ast: null,
      errors: [{
        message: message,
        line: lineMatch ? parseInt(lineMatch[1]) : null,
        column: colMatch ? parseInt(colMatch[1]) : null,
        position: err.hash ? err.hash.loc : null
      }]
    };
  }
}

function parseMongoQuery(query) {
  const trimmed = query.trim();
  let parsed;

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return {
      valid: false,
      ast: null,
      errors: [{ message: 'MongoDB query must start with { or [' }]
    };
  }

  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    const match = err.message.match(/position (\d+)/);
    const pos = match ? parseInt(match[1]) : null;
    return {
      valid: false,
      ast: null,
      errors: [{
        message: `Invalid JSON: ${err.message}`,
        position: pos
      }]
    };
  }

  const operators = [
    '$eq', '$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin',
    '$and', '$or', '$not', '$nor', '$exists', '$regex',
    '$set', '$unset', '$push', '$pull', '$inc',
    '$lookup', '$unwind', '$group', '$sort', '$limit', '$skip',
    '$project', '$match', '$addFields', '$replaceRoot'
  ];

  function validateFilter(obj, path = '') {
    const issues = [];
    if (typeof obj !== 'object' || obj === null) return issues;

    for (const [key, value] of Object.entries(obj)) {
      if (key.startsWith('$') && !operators.includes(key)) {
        const similar = operators.filter(o => {
          const dist = levenshteinSimple(key, o);
          return dist <= 2;
        });
        issues.push({
          message: `Unknown operator "${key}"`,
          path: path ? `${path}.${key}` : key,
          suggestion: similar.length > 0 ? `Did you mean: ${similar.join(', ')}?` : `Valid operators: ${operators.join(', ')}`
        });
      }

      if (key === '$regex' && typeof value !== 'string') {
        issues.push({
          message: `$regex value must be a string, got ${typeof value}`,
          path: `${path}.$regex`
        });
      }

      if (key === '$in' || key === '$nin') {
        if (!Array.isArray(value)) {
          issues.push({
            message: `${key} value must be an array`,
            path: `${path}.${key}`
          });
        }
      }

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        issues.push(...validateFilter(value, path ? `${path}.${key}` : key));
      }
    }
    return issues;
  }

  function validateAggregation(pipeline) {
    const issues = [];
    const validStages = [
      '$match', '$group', '$sort', '$limit', '$skip', '$project',
      '$lookup', '$unwind', '$addFields', '$replaceRoot', '$facet',
      '$bucket', '$bucketAuto', '$count', '$densify', '$documents',
      '$fill', '$geoNear', '$graphLookup', '$merge', '$out',
      '$unionWith', '$setWindowFields'
    ];

    if (!Array.isArray(pipeline)) {
      issues.push({ message: 'Aggregation pipeline must be an array' });
      return issues;
    }

    pipeline.forEach((stage, i) => {
      if (typeof stage !== 'object' || stage === null) {
        issues.push({ message: `Stage ${i} must be an object` });
        return;
      }
      for (const key of Object.keys(stage)) {
        if (!validStages.includes(key)) {
          issues.push({
            message: `Unknown aggregation stage "${key}" at position ${i}`,
            suggestion: `Did you mean: ${validStages.filter(s => s.startsWith(key.charAt(0))).slice(0, 3).join(', ')}?`
          });
        }
      }
    });

    return issues;
  }

  let issues = [];

  if (Array.isArray(parsed)) {
    issues = validateAggregation(parsed);
  } else if (typeof parsed === 'object') {
    issues = validateFilter(parsed);
  }

  return {
    valid: issues.length === 0,
    ast: parsed,
    errors: issues.filter(i => i.message && !i.suggestion).map(i => ({ message: i.message })),
    warnings: issues.filter(i => i.suggestion),
    allIssues: issues
  };
}

function parse(query, dbType) {
  if (dbType === 'mongodb') {
    return parseMongoQuery(query);
  }
  return parseSQL(query, dbType);
}

module.exports = { parse, parseSQL, parseMongoQuery };
