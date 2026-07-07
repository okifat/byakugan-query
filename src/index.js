require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'query-validator-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

const { requireAuth, requireUser, optionalAuth } = require('./middleware/auth');

// --- Auth Routes ---
const ldapService = require('./services/ldap');

app.get('/login', (req, res) => {
  if (req.session && req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await ldapService.authenticate(username, password);
    req.session.user = {
      username: user.username,
      dn: user.dn,
      email: user.email,
      fullName: user.fullName,
      role: 'user',
      loginTime: new Date().toISOString()
    };
    console.log('[Auth] Login successful:', username);
    res.redirect('/');
  } catch (error) {
    console.error('[Auth] Login failed:', error.message);
    res.render('login', { error: 'Username atau password salah' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// --- Main page (guest can access) ---
app.get('/', optionalAuth, (req, res) => {
  res.render('index', { user: req.user });
});

// --- API Routes ---
const validateRouter = require('./routes/validate');
app.use('/api', optionalAuth, validateRouter);

// --- Connection Routes (logged-in only) ---
const connectionRouter = require('./routes/connections');
app.use('/api', requireUser, connectionRouter);

// --- Guest API fallback ---
app.get('/api/connections', (req, res) => {
  res.json([]);
});

app.listen(PORT, () => {
  console.log(`\n  query-validator running at http://localhost:${PORT}\n`);
});

module.exports = app;
