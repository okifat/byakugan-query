const fs = require('fs');
const path = require('path');
const { encrypt, decrypt, hashId } = require('../utils/crypto');

const DB_DIR = path.join(__dirname, '../../db/connections');

function ensureDir() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
}

function getUserFile(username) {
  return path.join(DB_DIR, `${hashId(username)}.json`);
}

function loadConnections(username) {
  ensureDir();
  const file = getUserFile(username);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data.connections || [];
  } catch {
    return [];
  }
}

function saveConnections(username, connections) {
  ensureDir();
  const file = getUserFile(username);
  fs.writeFileSync(file, JSON.stringify({ connections }, null, 2));
}

function addConnection(username, conn) {
  const connections = loadConnections(username);
  const id = Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  const newConn = {
    id,
    name: conn.name || 'Untitled',
    type: conn.type || 'postgresql',
    host: conn.host || 'localhost',
    port: conn.port || getDefaultPort(conn.type),
    database: conn.database || '',
    username: conn.username || '',
    password: encrypt(conn.password || ''),
    ssl: conn.ssl || false,
    createdAt: new Date().toISOString()
  };
  connections.push(newConn);
  saveConnections(username, connections);
  return sanitize(newConn);
}

function updateConnection(username, id, updates) {
  const connections = loadConnections(username);
  const idx = connections.findIndex(c => c.id === id);
  if (idx === -1) return null;

  if (updates.password) {
    updates.password = encrypt(updates.password);
  }

  connections[idx] = { ...connections[idx], ...updates, id };
  saveConnections(username, connections);
  return sanitize(connections[idx]);
}

function deleteConnection(username, id) {
  const connections = loadConnections(username);
  const filtered = connections.filter(c => c.id !== id);
  if (filtered.length === connections.length) return false;
  saveConnections(username, filtered);
  return true;
}

function getConnection(username, id) {
  const connections = loadConnections(username);
  return connections.find(c => c.id === id) || null;
}

function getConnectionWithPassword(username, id) {
  const conn = getConnection(username, id);
  if (conn) conn.password = decrypt(conn.password);
  return conn;
}

function sanitize(conn) {
  return { ...conn, password: conn.password ? '****' : '' };
}

function sanitizeAll(connections) {
  return connections.map(sanitize);
}

function getDefaultPort(type) {
  const ports = { postgresql: 5432, mysql: 3306, mongodb: 27017 };
  return ports[type] || 5432;
}

module.exports = {
  loadConnections,
  addConnection,
  updateConnection,
  deleteConnection,
  getConnection,
  getConnectionWithPassword,
  sanitizeAll
};
