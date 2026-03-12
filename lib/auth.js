const crypto = require('crypto');
const config = require('./config');

function tokenForPassword(password) {
  return crypto.createHmac('sha256', config.sessionSecret).update(password).digest('hex');
}

function isAuthed(req) {
  const cookie = req.cookies?.cet_session;
  return cookie && cookie === tokenForPassword(config.appPassword);
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  return res.status(401).json({ ok: false, error: 'Yetkisiz' });
}

module.exports = { tokenForPassword, isAuthed, requireAuth };
