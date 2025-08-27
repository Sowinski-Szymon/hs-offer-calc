// /api/_lib/cors.js (ESM)

function norm(o) {
  if (!o) return '';
  o = o.trim().toLowerCase();
  if (o.endsWith('/')) o = o.slice(0, -1);
  // zrówna "www." i bez "www."
  if (o.startsWith('https://www.')) o = 'https://' + o.slice(12);
  if (o.startsWith('http://www.'))  o = 'http://'  + o.slice(11);
  return o;
}

function match(origin, list) {
  const O = norm(origin);
  return list.some(raw => {
    const L = norm(raw);
    if (!L) return false;
    if (L.startsWith('*.')) return O.endsWith(L.slice(1)); // np. *.hs-sites.com
    return O === L;
  });
}

// ZMIANA: Użycie 'export' przed deklaracją funkcji zamiast 'exports.withCORS ='
export function withCORS(handler) {
  return async (req, res) => {
    const origin = req.headers.origin || '';
    const list = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '')
      .split(',').map(s => s.trim()).filter(Boolean);
    const star = list.length === 1 && list[0] === '*';

    // USTAW NAGŁÓWKI ZANIM wywołasz handler
    if (star || match(origin, list)) {
      res.setHeader('Access-Control-Allow-Origin', star ? '*' : origin);
    } else {
      // nadal ustaw resztę nagłówków, żeby preflight miał komplet
      res.setHeader('Access-Control-Allow-Origin', 'null');
      return res.status(403).json({ error: 'CORS', detail: `Origin ${origin} not allowed`, allowed: list });
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') return res.status(204).end();

    try {
      return await handler(req, res);
    } catch (e) {
      // ZAWSZE odpowiedz JSON-em z nagłówkami CORS
      return res.status(500).json({ error: 'server', detail: String(e?.message || e) });
    }
  };
};
