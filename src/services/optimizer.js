function optimizeSQL(ast, query) {
  const suggestions = [];
  const upperQuery = query.toUpperCase();

  if (upperQuery.includes('SELECT *') || upperQuery.includes('SELECT *,')) {
    suggestions.push({
      type: 'optimization',
      category: 'performance',
      message: 'Avoid SELECT * — specify only the columns you need',
      detail: 'SELECT * fetches all columns including unused ones, increasing I/O and memory usage'
    });
  }

  if ((upperQuery.startsWith('DELETE') || upperQuery.startsWith('UPDATE')) && !upperQuery.includes('WHERE')) {
    suggestions.push({
      type: 'warning',
      category: 'safety',
      message: `${upperQuery.split(' ')[0]} without WHERE clause will affect ALL rows`,
      detail: 'Add a WHERE clause to limit the number of rows affected'
    });
  }

  if (upperQuery.includes("LIKE '%") || upperQuery.includes('LIKE "%')) {
    suggestions.push({
      type: 'optimization',
      category: 'performance',
      message: 'LIKE with leading wildcard (%...) prevents index usage',
      detail: 'Consider using full-text search (MATCH AGAINST / GIN index) for better performance'
    });
  }

  if (!upperQuery.includes('LIMIT') && upperQuery.startsWith('SELECT')) {
    if (!upperQuery.includes('COUNT') && !upperQuery.includes('SUM') && !upperQuery.includes('AVG')) {
      suggestions.push({
        type: 'optimization',
        category: 'performance',
        message: 'SELECT without LIMIT may return unbounded results',
        detail: 'Add LIMIT to prevent accidental retrieval of millions of rows'
      });
    }
  }

  if (upperQuery.includes('NOT IN') && upperQuery.includes('SELECT')) {
    suggestions.push({
      type: 'optimization',
      category: 'performance',
      message: 'NOT IN with subquery can be slow — consider NOT EXISTS or LEFT JOIN ... IS NULL',
      detail: 'NOT IN with NULL values in subquery returns empty result; NOT EXISTS is safer and often faster'
    });
  }

  if (upperQuery.includes('OR') && upperQuery.includes('WHERE')) {
    const orMatches = upperQuery.match(/\bOR\b/g);
    if (orMatches && orMatches.length >= 3) {
      suggestions.push({
        type: 'optimization',
        category: 'performance',
        message: 'Multiple OR conditions may prevent index usage',
        detail: 'Consider using UNION ALL or IN (...) instead of multiple OR conditions'
      });
    }
  }

  if (upperQuery.includes('ORDER BY') && upperQuery.includes('LIMIT')) {
    if (!upperQuery.includes('USE INDEX') && !upperQuery.includes('FORCE INDEX')) {
      suggestions.push({
        type: 'optimization',
        category: 'performance',
        message: 'ORDER BY with LIMIT may cause filesort without proper index',
        detail: 'Ensure the ORDER BY columns are covered by an index for optimal performance'
      });
    }
  }

  if (upperQuery.includes('DISTINCT') && upperQuery.includes('GROUP BY')) {
    suggestions.push({
      type: 'optimization',
      category: 'redundancy',
      message: 'DISTINCT with GROUP BY is redundant — GROUP BY already removes duplicates'
    });
  }

  if (upperQuery.includes('INSERT INTO') && upperQuery.includes('VALUES') && upperQuery.includes('),')) {
    suggestions.push({
      type: 'optimization',
      category: 'performance',
      message: 'Multiple INSERT VALUES detected — consider batch insert',
      detail: 'Batch inserts with multiple VALUES rows are more efficient than individual INSERT statements'
    });
  }

  const joinWithoutOn = upperQuery.match(/JOIN\s+\w+\s+(?:\w+\s+)?(?:WHERE|GROUP|ORDER|LIMIT|HAVING)/i);
  if (joinWithoutOn) {
    suggestions.push({
      type: 'error',
      category: 'syntax',
      message: 'JOIN without ON clause detected',
      detail: 'Every JOIN must have an ON condition to specify the join relationship'
    });
  }

  const havingWithoutGroup = upperQuery.includes('HAVING') && !upperQuery.includes('GROUP BY');
  if (havingWithoutGroup) {
    suggestions.push({
      type: 'warning',
      category: 'syntax',
      message: 'HAVING without GROUP BY — this will treat the entire result as one group'
    });
  }

  return suggestions;
}

function optimizeMongo(pipeline) {
  const suggestions = [];

  if (Array.isArray(pipeline)) {
    const hasMatch = pipeline.some(s => s.$match);
    const hasSort = pipeline.some(s => s.$sort);
    const hasLimit = pipeline.some(s => s.$limit);
    const hasGroup = pipeline.some(s => s.$group);
    const hasLookup = pipeline.some(s => s.$lookup);

    if (hasLookup && !hasGroup) {
      suggestions.push({
        type: 'optimization',
        category: 'performance',
        message: '$lookup without subsequent $group may produce duplicate documents',
        detail: 'Consider if the lookup results need grouping or if $unwind + $group is needed'
      });
    }

    if (hasSort && hasLookup) {
      const matchIndex = pipeline.findIndex(s => s.$match);
      const sortIndex = pipeline.findIndex(s => s.$sort);
      if (matchIndex > sortIndex) {
        suggestions.push({
          type: 'optimization',
          category: 'performance',
          message: '$match should come before $sort for better performance',
          detail: 'Filtering early reduces the number of documents to sort'
        });
      }
    }

    if (hasLimit && !hasSort) {
      suggestions.push({
        type: 'warning',
        category: 'logic',
        message: '$limit without $sort returns arbitrary documents',
        detail: 'Add $sort before $limit to get consistent results'
      });
    }

    if (hasGroup) {
      const matchFirst = pipeline[0]?.$match;
      if (!matchFirst) {
        suggestions.push({
          type: 'optimization',
          category: 'performance',
          message: 'Add $match at the start of pipeline to reduce documents processed by $group',
          detail: 'Early filtering reduces memory usage and processing time'
        });
      }
    }
  } else if (typeof pipeline === 'object') {
    const keys = Object.keys(pipeline);
    if (keys.length > 5) {
      suggestions.push({
        type: 'optimization',
        category: 'readability',
        message: 'Complex filter with many conditions — consider using $and for clarity'
      });
    }
  }

  return suggestions;
}

function optimize(ast, query, dbType) {
  if (dbType === 'mongodb') {
    return optimizeMongo(ast);
  }
  return optimizeSQL(ast, query);
}

module.exports = { optimize };
