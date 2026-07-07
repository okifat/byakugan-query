/**
 * autoFixer.js — Auto-fix queries based on validation results
 */

/**
 * Auto-fix a query based on schema issues, parse errors, and tuning suggestions
 * @param {string} query - Original query
 * @param {string} dbType - 'postgresql' | 'mysql' | 'mongodb'
 * @param {Array} schemaIssues - Issues from schemaValidator
 * @param {Array} parseErrors - Errors from parser
 * @param {Array} tuning - Suggestions from tuning service
 * @returns {{ fixedQuery: string, fixes: Array }}
 */
function autoFix(query, dbType, schemaIssues = [], parseErrors = [], tuning = []) {
  let fixedQuery = query;
  const fixes = [];

  if (dbType === 'mongodb') {
    const result = fixMongoQuery(fixedQuery, schemaIssues, parseErrors);
    fixedQuery = result.fixedQuery;
    fixes.push(...result.fixes);
  } else {
    const result = fixSQLQuery(fixedQuery, schemaIssues, parseErrors, tuning);
    fixedQuery = result.fixedQuery;
    fixes.push(...result.fixes);
  }

  return { fixedQuery, fixes };
}

// ============================
// SQL Auto-Fix
// ============================

function fixSQLQuery(query, schemaIssues, parseErrors, tuning) {
  let fixed = query;
  const fixes = [];

  // 1. Fix schema name typos (table and column)
  const schemaResult = fixSchemaNames(fixed, schemaIssues);
  fixed = schemaResult.fixed;
  fixes.push(...schemaResult.fixes);

  // 2. Fix UNION -> UNION ALL
  const unionResult = fixUnionAll(fixed, tuning);
  fixed = unionResult.fixed;
  fixes.push(...unionResult.fixes);

  // 3. Fix NOT IN -> NOT EXISTS
  const notInResult = fixNotInToNotExists(fixed, tuning);
  fixed = notInResult.fixed;
  fixes.push(...notInResult.fixes);

  // 4. Fix missing commas
  const commaResult = fixMissingCommas(fixed, parseErrors);
  fixed = commaResult.fixed;
  fixes.push(...commaResult.fixes);

  return { fixedQuery: fixed, fixes };
}

/**
 * Fix table and column name typos based on schema issues
 */
function fixSchemaNames(query, schemaIssues) {
  let fixed = query;
  const fixes = [];

  for (const issue of schemaIssues) {
    if (!issue.suggestion) continue;

    const msg = issue.message || '';

    // Table name fix: `Table "X" does not exist in schema`
    const tableMatch = msg.match(/Table "([^"]+)" does not exist/);
    if (tableMatch) {
      const wrongName = tableMatch[1];
      const correctName = issue.suggestion.replace(/Did you mean "([^"]+)"\?/, '$1');
      if (correctName && correctName !== wrongName) {
        fixed = replaceNameInQuery(fixed, wrongName, correctName);
        fixes.push({
          from: wrongName,
          to: correctName,
          type: 'schema',
          description: `Table name corrected: "${wrongName}" → "${correctName}"`
        });
      }
      continue;
    }

    // Column name fix: `Column "X" does not exist in table "Y"`
    const colMatch = msg.match(/Column "([^"]+)" does not exist in table "([^"]+)"/);
    if (colMatch) {
      const wrongName = colMatch[1];
      const correctName = issue.suggestion.replace(/Did you mean "([^"]+)"\?/, '$1');
      if (correctName && correctName !== wrongName) {
        fixed = replaceNameInQuery(fixed, wrongName, correctName);
        fixes.push({
          from: wrongName,
          to: correctName,
          type: 'schema',
          description: `Column name corrected: "${wrongName}" → "${correctName}"`
        });
      }
    }
  }

  return { fixed, fixes };
}

/**
 * Replace a name in query, preserving case where possible
 */
function replaceNameInQuery(query, wrongName, correctName) {
  // Try case-sensitive first
  const regex = new RegExp(`\\b${escapeRegex(wrongName)}\\b`, 'g');
  if (regex.test(query)) {
    return query.replace(regex, correctName);
  }
  // Try case-insensitive
  const regexCI = new RegExp(`\\b${escapeRegex(wrongName)}\\b`, 'gi');
  return query.replace(regexCI, correctName);
}

/**
 * Fix UNION -> UNION ALL
 */
function fixUnionAll(query, tuning) {
  let fixed = query;
  const fixes = [];

  const hasUnionRewrite = tuning.some(t =>
    t.type === 'rewrite' && t.title && t.title.toLowerCase().includes('union all')
  );

  if (hasUnionRewrite) {
    const regex = /\bUNION\b(?!\s+ALL)/gi;
    if (regex.test(fixed)) {
      fixed = fixed.replace(regex, 'UNION ALL');
      fixes.push({
        from: 'UNION',
        to: 'UNION ALL',
        type: 'rewrite',
        description: 'Changed UNION to UNION ALL for better performance'
      });
    }
  }

  return { fixed, fixes };
}

/**
 * Fix NOT IN (subquery) -> NOT EXISTS
 */
function fixNotInToNotExists(query, tuning) {
  let fixed = query;
  const fixes = [];

  const hasNotExistsRewrite = tuning.some(t =>
    t.type === 'rewrite' && t.title && t.title.toLowerCase().includes('not exists')
  );

  if (hasNotExistsRewrite) {
    // Pattern: column NOT IN (SELECT ...)
    const regex = /(\w+)\s+NOT\s+IN\s*\(\s*(SELECT\s+.+?)\)/gi;
    const match = fixed.match(regex);
    if (match) {
      // Extract column and subquery
      const notInRegex = /(\w+)\s+NOT\s+IN\s*\(\s*(SELECT\s+(\w+)\s+FROM\s+(\w+)(?:\s+WHERE\s+(.+?))?)\s*\)/i;
      const m = fixed.match(notInRegex);
      if (m) {
        const [, outerCol, , innerTable, innerCol, innerWhere] = m;
        const existsSubquery = innerWhere
          ? `NOT EXISTS (SELECT 1 FROM ${innerTable} WHERE ${innerCol} = ${outerCol} AND ${innerWhere})`
          : `NOT EXISTS (SELECT 1 FROM ${innerTable} WHERE ${innerCol} = ${outerCol})`;
        fixed = fixed.replace(regex, existsSubquery);
        fixes.push({
          from: `${outerCol} NOT IN (SELECT ...)`,
          to: existsSubquery.substring(0, 60) + '...',
          type: 'rewrite',
          description: 'Changed NOT IN subquery to NOT EXISTS for better performance'
        });
      }
    }
  }

  return { fixed, fixes };
}

/**
 * Fix missing commas based on parse errors
 */
function fixMissingCommas(query, parseErrors) {
  let fixed = query;
  const fixes = [];

  const commaErrors = parseErrors.filter(e =>
    e.message && e.message.toLowerCase().includes('comma')
  );

  if (commaErrors.length > 0) {
    const lines = fixed.split('\n');
    let modified = false;

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      const nextLine = lines[i + 1].trim();

      if (!line || !nextLine) continue;
      if (line.endsWith(',') || nextLine.startsWith(',')) continue;

      const keywords = ['FROM', 'WHERE', 'JOIN', 'ON', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION'];
      const nextUpper = nextLine.toUpperCase();

      if (keywords.some(kw => nextUpper.startsWith(kw))) continue;

      if (nextUpper.startsWith('SELECT') || nextUpper.startsWith('FROM') || nextUpper.startsWith('WHERE')) {
        continue;
      }

      if (!line.endsWith(';') && !line.endsWith('(')) {
        lines[i] = line + ',';
        modified = true;
        fixes.push({
          from: `line ${i + 1}: ...${line.substring(line.length - 20)}`,
          to: `line ${i + 1}: ...${line.substring(line.length - 20)},`,
          type: 'syntax',
          description: `Added missing comma after line ${i + 1}`
        });
      }
    }

    if (modified) {
      fixed = lines.join('\n');
    }
  }

  return { fixed, fixes };
}

// ============================
// MongoDB Auto-Fix
// ============================

function fixMongoQuery(query, schemaIssues, parseErrors) {
  let fixed = query;
  const fixes = [];

  try {
    let parsed = JSON.parse(query);

    // 1. Fix operator typos
    const opResult = fixMongoOperators(parsed);
    parsed = opResult.parsed;
    fixes.push(...opResult.fixes);

    // 2. Fix $in/$nin values (ensure array)
    const arrayResult = fixMongoArrayValues(parsed);
    parsed = arrayResult.parsed;
    fixes.push(...arrayResult.fixes);

    // 3. Fix field name typos from schema issues
    const fieldResult = fixMongoFieldNames(parsed, schemaIssues);
    parsed = fieldResult.parsed;
    fixes.push(...fieldResult.fixes);

    fixed = JSON.stringify(parsed, null, 2);
  } catch (e) {
    // If JSON is invalid, can't auto-fix
  }

  return { fixed, fixes };
}

const KNOWN_OPERATORS = new Set([
  '$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$in', '$nin', '$not', '$nor',
  '$and', '$or', '$exists', '$type', '$regex', '$options', '$mod', '$elemMatch',
  '$size', '$all', '$slice', '$ positional', '$each', '$push', '$addToSet',
  '$pop', '$pull', '$rename', '$unset', '$inc', '$mul', '$min', '$max',
  '$set', '$currentDate', '$mul',
  // Aggregation
  '$match', '$group', '$sort', '$limit', '$skip', '$project', '$unwind',
  '$lookup', '$addFields', '$replaceRoot', '$count', '$facet', '$bucket',
  '$bucketAuto', '$geoNear', '$graphLookup', '$merge', '$out', '$sample',
  '$unionWith', '$setWindowFields'
]);

const KNOWN_STAGES = new Set([
  '$match', '$group', '$sort', '$limit', '$skip', '$project', '$unwind',
  '$lookup', '$addFields', '$replaceRoot', '$count', '$facet',
  '$bucket', '$bucketAuto', '$geoNear', '$graphLookup', '$merge', '$out',
  '$sample', '$unionWith', '$setWindowFields'
]);

function fixMongoOperators(obj) {
  const fixes = [];

  function walk(node) {
    if (typeof node !== 'object' || node === null) return;

    for (const key of Object.keys(node)) {
      if (key.startsWith('$') && !KNOWN_OPERATORS.has(key)) {
        const similar = findSimilarKey(key, KNOWN_OPERATORS);
        if (similar) {
          node[similar] = node[key];
          delete node[key];
          fixes.push({
            from: key,
            to: similar,
            type: 'schema',
            description: `Operator corrected: "${key}" → "${similar}"`
          });
        }
      }
      walk(node[key]);
    }
  }

  walk(obj);
  return { parsed: obj, fixes };
}

function fixMongoArrayValues(obj) {
  const fixes = [];

  function walk(node) {
    if (typeof node !== 'object' || node === null) return;

    if (node.$in && !Array.isArray(node.$in)) {
      node.$in = [node.$in];
      fixes.push({
        from: '$in: ' + JSON.stringify(node.$in[0]),
        to: '$in: [' + JSON.stringify(node.$in[0]) + ']',
        type: 'syntax',
        description: 'Wrapped $in value in array'
      });
    }

    if (node.$nin && !Array.isArray(node.$nin)) {
      node.$nin = [node.$nin];
      fixes.push({
        from: '$nin: ' + JSON.stringify(node.$nin[0]),
        to: '$nin: [' + JSON.stringify(node.$nin[0]) + ']',
        type: 'syntax',
        description: 'Wrapped $nin value in array'
      });
    }

    for (const key of Object.keys(node)) {
      if (typeof node[key] === 'object') {
        walk(node[key]);
      }
    }
  }

  walk(obj);
  return { parsed: obj, fixes };
}

function fixMongoFieldNames(obj, schemaIssues) {
  const fixes = [];

  // Build field name mapping from schema issues
  const fieldMap = new Map();
  for (const issue of schemaIssues) {
    if (!issue.suggestion) continue;
    const fieldMatch = issue.message.match(/Field "([^"]+)"/);
    if (fieldMatch) {
      const wrongName = fieldMatch[1];
      const correctName = issue.suggestion.replace(/Did you mean "([^"]+)"\?/, '$1');
      if (correctName && correctName !== wrongName) {
        fieldMap.set(wrongName, correctName);
      }
    }
  }

  if (fieldMap.size === 0) return { parsed: obj, fixes };

  function walk(node) {
    if (typeof node !== 'object' || node === null) return;

    for (const key of Object.keys(node)) {
      if (fieldMap.has(key)) {
        const newKey = fieldMap.get(key);
        node[newKey] = node[key];
        delete node[key];
        fixes.push({
          from: key,
          to: newKey,
          type: 'schema',
          description: `Field name corrected: "${key}" → "${newKey}"`
        });
      }
      walk(node[key]);
    }
  }

  walk(obj);
  return { parsed: obj, fixes };
}

// ============================
// Helpers
// ============================

function findSimilarKey(key, validKeys) {
  let best = null;
  let bestDist = Infinity;

  for (const valid of validKeys) {
    const dist = levenshtein(key.toLowerCase(), valid.toLowerCase());
    if (dist < bestDist && dist <= 3) {
      bestDist = dist;
      best = valid;
    }
  }

  return best;
}

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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { autoFix };
