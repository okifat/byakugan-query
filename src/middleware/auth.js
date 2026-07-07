function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.redirect('/login');
}

function requireUser(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Login required' });
  }
  res.redirect('/login');
}

function optionalAuth(req, res, next) {
  req.user = req.session?.user || null;
  next();
}

module.exports = { requireAuth, requireUser, optionalAuth };
