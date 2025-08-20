import { withCORS } from './_lib/cors.js';
import { hsFetch } from './_lib/hs.js';

export default withCORS(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const q = String(req.query.query || '').trim();
  if (q.length < 2) return res.status(200).json([]);

  const data = await hsFetch('/crm/v3/objects/companies/search', {
    method: 'POST',
    body: {
      filterGroups: [
        { filters: [{ propertyName: 'name', operator: 'CONTAINS_TOKEN', value: q }] },
        { filters: [{ propertyName: 'domain', operator: 'CONTAINS_TOKEN', value: q }] }
      ],
      properties: ['name', 'domain'],
      limit: 10
    }
  });

  const results = (data.results || []).map(r => ({ id: r.id, properties: r.properties }));
  res.status(200).json(results);
});
