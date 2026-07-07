const mysql = require('mysql2/promise');

async function fetchSchema(conn) {
  const config = {
    host: conn.host,
    port: conn.port || 3306,
    database: conn.database,
    user: conn.username,
    password: conn.password,
    connectTimeout: 10000
  };
  if (conn.ssl) config.ssl = { rejectUnauthorized: false };
  const connection = await mysql.createConnection(config);

  try {
    const [tables] = await connection.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = ?
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `, [conn.database]);

    const schema = { tables: {} };

    for (const row of tables) {
      const [cols] = await connection.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = ?
        AND table_name = ?
        ORDER BY ordinal_position
      `, [conn.database, row.table_name]);

      schema.tables[row.table_name] = { columns: {} };

      for (const col of cols) {
        schema.tables[row.table_name].columns[col.column_name] = {
          type: col.data_type.toUpperCase(),
          nullable: col.IS_NULLABLE === 'YES',
          default: col.column_default || undefined
        };
      }
    }

    return schema;
  } finally {
    await connection.end();
  }
}

async function testConnection(conn) {
  try {
    const config = {
      host: conn.host,
      port: conn.port || 3306,
      database: conn.database,
      user: conn.username,
      password: conn.password,
      connectTimeout: 5000
    };
    if (conn.ssl) config.ssl = { rejectUnauthorized: false };
    const connection = await mysql.createConnection(config);
    await connection.query('SELECT 1');
    await connection.end();
    return { success: true, message: 'Connected successfully' };
  } catch (err) {
    return { success: false, message: err.message };
  }
}

module.exports = { fetchSchema, testConnection };
