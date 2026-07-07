function suggestFixes(errors, ast, query, dbType) {
  const suggestions = [];

  for (const err of errors) {
    const msg = err.message || '';

    if (msg.includes('near "') || msg.includes('Unknown column')) {
      const nameMatch = msg.match(/["']([^"']+)["']/);
      if (nameMatch) {
        suggestions.push({
          type: 'suggestion',
          category: 'fix',
          message: `Check spelling of "${nameMatch[1]}" — it may be a typo`,
          fix: `Verify the name exists in your database schema`
        });
      }
    }

    if (msg.includes('syntax error') || msg.includes('Syntax error')) {
      suggestions.push({
        type: 'suggestion',
        category: 'fix',
        message: 'SQL syntax error detected',
        fix: 'Check for missing commas, unclosed quotes, or misplaced keywords'
      });

      const lines = query.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.endsWith(',') && !trimmed.endsWith(';') &&
            !trimmed.endsWith('(') && !trimmed.endsWith(')') &&
            !trimmed.startsWith('--') && !trimmed.startsWith('/*')) {
          const upperLine = trimmed.toUpperCase();
          if (upperLine.startsWith('SELECT') || upperLine.startsWith('FROM') ||
              upperLine.startsWith('WHERE') || upperLine.startsWith('AND') ||
              upperLine.startsWith('OR') || upperLine.startsWith('ORDER') ||
              upperLine.startsWith('GROUP')) {
            const nextLine = lines[lines.indexOf(line) + 1];
            if (nextLine && !nextLine.trim().startsWith(',')) {
              suggestions.push({
                type: 'suggestion',
                category: 'fix',
                message: `Possible missing comma after "${trimmed.substring(0, 30)}..."`,
                fix: `Add comma at end of line`
              });
            }
          }
        }
      }
    }

    if (msg.includes('Unclosed') || msg.includes('unterminated')) {
      suggestions.push({
        type: 'suggestion',
        category: 'fix',
        message: 'Unclosed string or comment',
        fix: 'Check for matching opening/closing quotes (\' or ") and comment delimiters (-- or /* */)'
      });
    }

    if (msg.includes('Invalid JSON')) {
      const posMatch = msg.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        const before = query.substring(Math.max(0, pos - 20), pos);
        const after = query.substring(pos, pos + 20);
        suggestions.push({
          type: 'suggestion',
          category: 'fix',
          message: `JSON error near: ...${before}>>>HERE<<<${after}...`,
          fix: 'Check for missing/extra commas, brackets, or quotes at this position'
        });
      }
    }

    if (msg.includes('Unknown operator')) {
      const opMatch = msg.match(/\$(\w+)/);
      if (opMatch) {
        const knownOps = [
          '$eq', '$gt', '$gte', '$lt', '$lte', '$ne', '$in', '$nin',
          '$and', '$or', '$not', '$nor', '$exists', '$regex'
        ];
        const similar = knownOps.filter(o => {
          const dist = levenshteinSimple(`$${opMatch[1]}`, o);
          return dist <= 2;
        });
        if (similar.length > 0) {
          suggestions.push({
            type: 'suggestion',
            category: 'fix',
            message: `Unknown operator "$${opMatch[1]}"`,
            fix: `Did you mean: ${similar.join(', ')}?`
          });
        }
      }
    }
  }

  if (dbType === 'mongodb' && typeof ast === 'object' && ast !== null) {
    const filterKeys = Object.keys(ast);
    const unknownFields = filterKeys.filter(k => !k.startsWith('$'));
    if (unknownFields.length > 0) {
      const mongoOperators = ['$and', '$or', '$not', '$nor', '$expr', '$jsonSchema'];
      for (const field of unknownFields) {
        if (field.includes('.')) {
          suggestions.push({
            type: 'info',
            category: 'hint',
            message: `Nested field "${field}" — make sure to use dot notation correctly`,
            fix: 'Example: {"address.city": "Jakarta"}'
          });
        }
      }
    }
  }

  return suggestions;
}

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

module.exports = { suggestFixes };
