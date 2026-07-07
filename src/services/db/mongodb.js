const { MongoClient } = require('mongodb');

function buildUri(conn) {
  const auth = conn.username ? `${conn.username}:${conn.password}@` : '';
  const port = conn.port || 27017;
  const scheme = conn.ssl ? 'mongodb+srv' : 'mongodb';
  if (conn.ssl) return `${scheme}://${auth}${conn.host}/${conn.database}?directConnection=true`;
  return `${scheme}://${auth}${conn.host}:${port}/${conn.database}?directConnection=true`;
}

async function fetchSchema(conn) {
  const client = new MongoClient(buildUri(conn), {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000
  });

  try {
    await client.connect();
    const db = client.db(conn.database);
    const collections = await db.listCollections().toArray();

    const schema = { collections: {} };

    for (const coll of collections) {
      if (coll.name.startsWith('system.')) continue;

      const sample = await db.collection(coll.name).findOne({});
      const fields = {};

      if (sample) {
        function walk(obj, prefix = '') {
          for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            if (key === '_id') continue;

            if (value === null) {
              fields[fullKey] = { type: 'null' };
            } else if (Array.isArray(value)) {
              fields[fullKey] = { type: 'array' };
              if (value.length > 0 && typeof value[0] === 'object') {
                walk(value[0], `${fullKey}[]`);
              }
            } else if (typeof value === 'object') {
              fields[fullKey] = { type: 'object' };
              walk(value, fullKey);
            } else {
              fields[fullKey] = { type: typeof value.charAt === 'function' ? 'String' : typeof value === 'number' ? (Number.isInteger(value) ? 'Integer' : 'Number') : typeof value === 'boolean' ? 'Boolean' : 'String' };
            }
          }
        }
        walk(sample);
      }

      fields._id = { type: 'ObjectId' };

      schema.collections[coll.name] = { fields };
    }

    return schema;
  } finally {
    await client.close();
  }
}

async function testConnection(conn) {
  const client = new MongoClient(buildUri(conn), {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  });

  try {
    await client.connect();
    await client.db().command({ ping: 1 });
    return { success: true, message: 'Connected successfully' };
  } catch (err) {
    return { success: false, message: err.message };
  } finally {
    await client.close();
  }
}

module.exports = { fetchSchema, testConnection };
