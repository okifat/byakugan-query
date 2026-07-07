const express = require('express');
const router = express.Router();
const connStore = require('../services/connectionStore');
const pgDb = require('../services/db/postgres');
const mysqlDb = require('../services/db/mysql');
const mongoDb = require('../services/db/mongodb');

function getDbDriver(type) {
  switch (type) {
    case 'postgresql': return pgDb;
    case 'mysql': return mysqlDb;
    case 'mongodb': return mongoDb;
    default: return null;
  }
}

// List user's connections
router.get('/connections', (req, res) => {
  const connections = connStore.loadConnections(req.session.user.username);
  res.json(connStore.sanitizeAll(connections));
});

// Add connection
router.post('/connections', (req, res) => {
  const { name, type, host, port, database, username, password, ssl } = req.body;
  if (!name || !type || !host || !database) {
    return res.status(400).json({ error: 'Name, type, host, and database are required' });
  }
  const conn = connStore.addConnection(req.session.user.username, { name, type, host, port, database, username, password, ssl });
  res.json(conn);
});

// Update connection
router.put('/connections/:id', (req, res) => {
  const updated = connStore.updateConnection(req.session.user.username, req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Connection not found' });
  res.json(updated);
});

// Delete connection
router.delete('/connections/:id', (req, res) => {
  const deleted = connStore.deleteConnection(req.session.user.username, req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Connection not found' });
  res.json({ success: true });
});

// Test existing connection
router.post('/connections/:id/test', async (req, res) => {
  const conn = connStore.getConnectionWithPassword(req.session.user.username, req.params.id);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });

  const driver = getDbDriver(conn.type);
  if (!driver) return res.status(400).json({ error: 'Unsupported database type' });

  try {
    const result = await driver.testConnection(conn);
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Test connection directly (without saving) — for add/edit form
router.post('/connections/test-direct', async (req, res) => {
  const { type, host, port, database, username, password, ssl } = req.body;
  if (!type || !host || !database) {
    return res.status(400).json({ success: false, message: 'Type, host, and database are required' });
  }

  const driver = getDbDriver(type);
  if (!driver) return res.status(400).json({ success: false, message: 'Unsupported database type: ' + type });

  const conn = { type, host, port: port || undefined, database, username: username || '', password: password || '', ssl: ssl || false };

  try {
    const result = await driver.testConnection(conn);
    res.json(result);
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Fetch schema from connection
router.get('/schema/:connectionId', async (req, res) => {
  const conn = connStore.getConnectionWithPassword(req.session.user.username, req.params.connectionId);
  if (!conn) return res.status(404).json({ error: 'Connection not found' });

  const driver = getDbDriver(conn.type);
  if (!driver) return res.status(400).json({ error: 'Unsupported database type' });

  try {
    const schema = await driver.fetchSchema(conn);
    res.json(schema);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch schema: ' + err.message });
  }
});

module.exports = router;
