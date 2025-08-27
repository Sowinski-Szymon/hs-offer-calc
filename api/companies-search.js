// ZMIANA: Użycie 'import' zamiast 'require' i dodanie rozszerzenia .js
import { withCORS } from './_lib/cors.js';

const HS_BASE = 'https://api.hubapi.com';

// ZMIANA: Użycie 'export default' zamiast 'module.exports'
export default withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.HUBSPOT_PRIVATE_APP_TOKEN || '';
  if (!token || token.length < 10) {
    return res.status(500).json({ error: 'Missing HUBSPOT_PRIVATE_APP_TOKEN env' });
  }

  const q = String(req.query.query || '').trim();
  if (q.length < 2) return res.status(200).json([]);

  const r = await fetch(`${HS_BASE}/crm/v3/objects/companies/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filterGroups: [
        { filters: [{ propertyName: 'name', operator: 'CONTAINS_TOKEN', value: q }] },
        { filters: [{ propertyName: 'domain', operator: 'CONTAINS_TOKEN', value: q }] }
      ],
      properties: ['name', 'domain'],
      limit: 10
    })
  });

  const text = await r.text();

  if (!r.ok) {
    try { return res.status(r.status).json(JSON.parse(text)); }
    catch { return res.status(r.status).send(text); }
  }

  let data; try { data = JSON.parse(text); } catch { data = { results: [] }; }
  const results = (data.results || []).map(x => ({ id: x.id, properties: x.properties }));
  return res.status(200).json(results);
});
