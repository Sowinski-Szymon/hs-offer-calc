// /api/_lib/cors.js
export function withCORS(handler) {
  return async (req, res) => {
    const origin = req.headers.origin || '';
    // lista dozwolonych originów z env (CSV)
    const list = (process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // dopasowanie dokładne lub wildcard *.domena.tld (jeśli wpiszesz w env)
    const allowed = list.some(o => {
      if (!o) return false;
      if (o.startsWith('*.')) return origin.endsWith(o.slice(1)); // np. *.hs-sites.com
      return origin === o;
    });

    // jeśli pasuje – echo origin, inaczej nie zezwalaj (lub tymczasowo ustaw *)
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (list.length === 0) {
      // tryb awaryjny – tylko na testy!
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      // twarde odrzucenie – ułatwia diagnostykę
      res.status(403).json({ error: 'CORS', detail: `Origin ${origin} not allowed` });
      return;
    }

    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    return handler(req, res);
  };
}
