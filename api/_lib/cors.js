// /api/_lib/cors.js
export function withCORS(handler) {
  return async (req, res) => {
    const origin = req.headers.origin || '';
    const list = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const allowed = list.some(o => {
      if (o.startsWith('*.')) return origin.endsWith(o.slice(1)); // np. *.hs-sites.com
      return origin === o;
    });

    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (list.length === 0) {
      res.setHeader('Access-Control-Allow-Origin', '*'); // tylko tymczasowo
    } else {
      return res.status(403).json({ error: 'CORS', detail: `Origin ${origin} not allowed` });
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return handler(req, res);
  };
}
