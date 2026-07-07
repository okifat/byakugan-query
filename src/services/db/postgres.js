const { Pool } = require('pg');

async function fetchSchema(conn) {
  const config = {
    host: conn.host,
    port: conn.port || 5432,
    database: conn.database,
    user: conn.username,
    password: conn.password,
    connectionTimeoutMillis: 10000
  };
  if (conn.ssl) config.ssl = { rejectUnauthorized: false };
  const pool = new Pool(config);

  try {
    const client = await pool.connect();

    const tablesResult = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);

    const tables = {};
    for (const row of tablesResult.rows) {
      const colsResult = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = $1
        AND table_name = $2
        ORDER BY ordinal_position
      `, [row.table_schema, row.table_name]);

      const tableName = row.table_schema === 'public' ? row.table_name : `${row.table_schema}.${row.table_name}`;
      tables[tableName] = {
        columns: {}
      };

      for (const col of colsResult.rows) {
        tables[tableName].columns[col.column_name] = {
          type: col.data_type.toUpperCase(),
          nullable: col.is_nullable === 'YES',
          default: col.column_default || undefined
        };
      }
    }

    client.release();
    return { tables };
  } finally {
    await pool.end();
  }
}

async function testConnection(conn) {
  const config = {
    host: conn.host,
    port: conn.port || 5432,
    database: conn.database,
    user: conn.username,
    password: conn.password,
    connectionTimeoutMillis: 5000
  };
  if (conn.ssl) config.ssl = { rejectUnauthorized: false };
  const pool = new Pool(config);

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return { success: true, message: 'Connected successfully' };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    await pool.end();
  }
}

module.exports = { fetchSchema, testConnection };
