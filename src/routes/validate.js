const express = require('express');
const router = express.Router();
const { parse } = require('../services/parser');
const { validateSchema } = require('../services/schemaValidator');
const { optimize } = require('../services/optimizer');
const { suggestFixes } = require('../services/suggester');
const { tune } = require('../services/tuning');
const { autoFix } = require('../services/autoFixer');

function validateSingle(query, dbType, schema) {
  const result = {
    query: query.trim(),
    dbType,
    valid: false,
    errors: [],
    warnings: [],
    optimizations: [],
    suggestions: [],
    schemaIssues: [],
    tuning: [],
    fixedQuery: null,
    fixes: []
  };

  const parseResult = parse(query.trim(), dbType);
  result.valid = parseResult.valid;
  result.errors = parseResult.errors || [];
  result.warnings = parseResult.warnings || [];

  if (parseResult.valid && parseResult.ast) {
    result.optimizations = optimize(parseResult.ast, query.trim(), dbType);
    result.tuning = tune(parseResult.ast, query.trim(), dbType);
  }

  if (schema && parseResult.ast) {
    result.schemaIssues = validateSchema(parseResult.ast, schema, dbType);
  }

  if (result.errors.length > 0) {
    result.suggestions = suggestFixes(result.errors, parseResult.ast, query.trim(), dbType);
  }

  if (!result.valid && result.errors.length === 0) {
    result.errors.push({ message: 'Query validation failed' });
  }

  // Auto-fix
  const { fixedQuery, fixes } = autoFix(query.trim(), dbType, result.schemaIssues, result.errors, result.tuning);
  if (fixes.length > 0 && fixedQuery !== query.trim()) {
    result.fixedQuery = fixedQuery;
    result.fixes = fixes;
  }

  return result;
}

router.post('/validate', (req, res) => {
  const { query, queries, dbType, schema } = req.body;

  if (!['postgresql', 'mysql', 'mongodb'].includes(dbType)) {
    return res.status(400).json({ error: 'Invalid database type' });
  }

  // Batch mode
  if (Array.isArray(queries) && queries.length > 0) {
    const results = queries
      .map(q => (typeof q === 'string' ? q : q.query || ''))
      .filter(q => q.trim())
      .map(q => validateSingle(q, dbType, schema));

    const summary = {
      total: results.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length
    };

    return res.json({ mode: 'batch', results, summary });
  }

  // Single mode
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const result = validateSingle(query, dbType, schema);
  res.json({ mode: 'single', results: [result], summary: { total: 1, valid: result.valid ? 1 : 0, invalid: result.valid ? 0 : 1 } });
});

module.exports = router;
