# QueryValidator

Tool untuk validasi query SQL dan MongoDB sebelum dijalankan ke database.

## Cara Jalankan

```bash
cd query-validator
npm install
npm run dev
```

Buka `http://localhost:3001`

## Fitur

### 1. Validasi Query

- Tulis query di editor (kiri)
- Klik **Validate All** atau tekan `⌘ Enter` / `Ctrl + Enter`
- Hasil validasi muncul di panel kanan

### 2. Database Support

| Database | Parser |
|----------|--------|
| PostgreSQL | `node-sql-parser` |
| MySQL | `node-sql-parser` |
| MongoDB | Custom JSON parser |

Pilih database di tombol **PostgreSQL / MySQL / MongoDB** di atas editor.

### 3. Schema Validation

Schema digunakan untuk cek apakah table dan column yang di-query ada di database.

**Cara pakai:**
1. Klik panah di **Schema Editor** (bawah editor query)
2. Edit JSON schema manual, atau
3. Upload file `.json` via tombol upload

**Format schema:**
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

Upload beberapa file query sekaligus:
1. Klik **Upload Files** atau drag & drop file ke editor
2. File muncul di queue (bawah editor)
3. Klik **Validate All** → semua file + editor query di-validate

**Format file:** `.sql`, `.js`, `.json`, `.txt`

### 5. Template Query

Klik tombol template di atas editor untuk load contoh query:
- `SELECT` — contoh select dengan WHERE, ORDER BY, LIMIT
- `INSERT` — contoh insert
- `UPDATE` — contoh update
- `DELETE` — contoh delete
- `JOIN` — contoh join
- `SUBQUERY` — contoh subquery
- `AGG` — contoh aggregate (GROUP BY, HAVING)

## Hasil Validasi

### Validation Issues

| Tipe | Warna | Keterangan |
|------|-------|------------|
| Error | Merah | Query tidak valid (syntax error, table/column tidak ada) |
| Warning | Kuning | Potensi masalah (missing LIMIT, SELECT *) |
| Schema | Oranye | Table/column tidak ditemukan di schema |
| Optimization | Hijau | Saran optimasi query |
| Suggestion | Biru | Saran perbaikan error |

### Tuning Suggestions

| Section | Keterangan |
|---------|------------|
| Rewrite Suggestions | Cara rewrite query agar lebih efisien |
| Index Recommendations | Index yang sebaiknya dibuat |
| Tips | Tips tambahan untuk performa query |

## Keyboard Shortcuts

| Shortcut | Fungsi |
|----------|--------|
| `⌘ Enter` / `Ctrl + Enter` | Validate All |
| `Tab` | Insert tab di editor |
| `⌘ Z` / `Ctrl + Z` | Undo |
| `⌘ Shift Z` / `Ctrl + Shift Z` | Redo |

## Contoh Query yang Bisa Divalidate

### PostgreSQL / MySQL

```sql
-- Valid
SELECT id, name FROM users WHERE status = 'active';

-- Error: table tidak ada
SELECT * FROM non_existent_table;

-- Warning: SELECT *
SELECT * FROM users;

-- Warning: missing LIMIT
SELECT * FROM users ORDER BY created_at DESC;

-- Schema error: column tidak ada
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

| Masalah | Solusi |
|---------|--------|
| Query tidak divalidate | Pastikan fokus di editor, lalu `⌘ Enter` |
| Schema error padahal table ada | Cek apakah schema sudah benar dan table ada di JSON |
| File upload tidak muncul | Pastikan file berekstensi `.sql`, `.js`, `.json`, atau `.txt` |
