# ByakuganQuery

Tool for validating SQL and MongoDB queries before executing them on the database.

## How to Run

### Local

```bash
cd query-validator
npm install
npm run dev
```

Open `http://localhost:3001`

### Docker

```bash
cd query-validator

# Build image
docker build -t query-validator .

# Run container
docker run -d -p 3001:3001 --env-file .env --name query-validator query-validator
```

Open `http://localhost:3001`

**Docker Commands:**

| Action | Command |
|--------|---------|
| Stop | `docker stop query-validator` |
| Start | `docker start query-validator` |
| Logs | `docker logs -f query-validator` |
| Remove | `docker rm -f query-validator` |
| Rebuild | `docker build -t query-validator . && docker rm -f query-validator && docker run -d -p 3001:3001 --env-file .env --name query-validator query-validator` |

## Features

### 1. Query Validation

- Write query in the editor (left panel)
- Click **Validate All** or press `⌘ Enter` / `Ctrl + Enter`
- Validation results appear in the right panel

### 2. Database Support

| Database | Parser |
|----------|--------|
| PostgreSQL | `node-sql-parser` |
| MySQL | `node-sql-parser` |
| MongoDB | Custom JSON parser |

Select database using the **PostgreSQL / MySQL / MongoDB** button above the editor.

### 3. Schema Validation

Schema is used to check if the queried tables and columns exist in the database.

**How to use:**
1. Click the arrow in the **Schema Editor** (below the query editor)
2. Edit the JSON schema manually, or
3. Upload a `.json` file via the upload button

**Schema format:**
```json
{
  "tables": {
    "users": {
      "columns": {
        "id": { "type": "INTEGER" },
        "name": { "type": "VARCHAR" },
        "email": { "type": "VARCHAR" }
      }
    }
  }
}
```

### 4. File Queue

Upload multiple query files at once:
1. Click **Upload Files** or drag & drop files into the editor
2. Files appear in the queue (below the editor)
3. Click **Validate All** → all files + editor query are validated

**Supported file formats:** `.sql`, `.js`, `.json`, `.txt`

### 5. Query Templates

Click the template button above the editor to load sample queries:
- `SELECT` — select with WHERE, ORDER BY, LIMIT
- `INSERT` — insert example
- `UPDATE` — update example
- `DELETE` — delete example
- `JOIN` — join example
- `SUBQUERY` — subquery example
- `AGG` — aggregate example (GROUP BY, HAVING)

## Validation Results

### Validation Issues

| Type | Color | Description |
|------|-------|-------------|
| Error | Red | Invalid query (syntax error, missing table/column) |
| Warning | Yellow | Potential issues (missing LIMIT, SELECT *) |
| Schema | Orange | Table/column not found in schema |
| Optimization | Green | Query optimization suggestions |
| Suggestion | Blue | Error fix suggestions |

### Tuning Suggestions

| Section | Description |
|---------|-------------|
| Rewrite Suggestions | How to rewrite query for better efficiency |
| Index Recommendations | Indexes that should be created |
| Tips | Additional tips for query performance |

## Keyboard Shortcuts

| Shortcut | Function |
|----------|----------|
| `⌘ Enter` / `Ctrl + Enter` | Validate All |
| `Tab` | Insert tab in editor |
| `⌘ Z` / `Ctrl + Z` | Undo |
| `⌘ Shift Z` / `Ctrl + Shift Z` | Redo |

## Sample Queries

### PostgreSQL / MySQL

```sql
-- Valid
SELECT id, name FROM users WHERE status = 'active';

-- Error: table does not exist
SELECT * FROM non_existent_table;

-- Warning: SELECT *
SELECT * FROM users;

-- Warning: missing LIMIT
SELECT * FROM users ORDER BY created_at DESC;

-- Schema error: column does not exist
SELECT wrong_column FROM users;
```

### MongoDB

```json
{
  "status": "active",
  "age": { "$gte": 18 }
}
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Query not validated | Make sure editor is focused, then press `⌘ Enter` |
| Schema error even though table exists | Check if the schema is correct and table is defined in JSON |
| Uploaded file not showing | Ensure file has `.sql`, `.js`, `.json`, or `.txt` extension |
