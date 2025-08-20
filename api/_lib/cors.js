function isAllowed(origin, list) {
  return list.some(o => {
    if (!o) return false;
    o = o.trim();
    if (o.startsWith('*.')) return origin.endsWith(o.slice(1)); // np. *.hs-sites.com
    return origin === o;
  });
}

exports.withCORS = function withCORS(handler) {
  return async (req, res) => {
    const origin = req.headers.origin || '';
    const raw = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '';
    const list = raw.split(',').map(s => s.trim()).filter(Boolean);

    if (isAllowed(origin, list)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Max-Age', '86400');
      if (req.method === 'OPTIONS') return res.status(204).end();
      return handler(req, res);
    }
    return res.status(403).json({ error: 'CORS', detail: `Origin ${origin} not allowed`, allowed: list });
  };
};
