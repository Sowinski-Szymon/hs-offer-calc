const { withCORS } = require('./_lib/cors');

module.exports = withCORS((req, res) => {
  res.status(200).json({ ok: true, ts: Date.now() });
});
