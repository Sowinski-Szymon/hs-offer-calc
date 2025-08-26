// /api/deal-quotes.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

module.exports = withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const { dealId } = req.query;
  if (!dealId) return res.status(400).json({ error: 'dealId required' });

  // associations deal -> quotes
  const assoc = await hsFetch(`/crm/v4/objects/deals/${dealId}/associations/quotes?limit=100`);
  const qIds = (assoc?.results || []).map(r => r.to?.id).filter(Boolean);
  if (!qIds.length) return res.status(200).json({ quotes: [] });

  const props = ['hs_title','hs_status','hs_public_url','hs_createdate','hs_expiration_date'];
  const batch = await hsFetch(`/crm/v3/objects/quotes/batch/read`, {
    method: 'POST',
    body: JSON.stringify({ properties: props, inputs: qIds.map(id => ({ id })) })
  });

  const quotes = (batch?.results || []).map(q => ({
    id: q.id,
    name: q.properties?.hs_title || '(bez nazwy)',
    status: q.properties?.hs_status || '',
    publicUrl: q.properties?.hs_public_url || '',
    createdAt: q.properties?.hs_createdate || null,
    expiresAt: q.properties?.hs_expiration_date || null
  }));

  // sort newest first
  quotes.sort((a,b)=> (b.createdAt && a.createdAt) ? (new Date(b.createdAt)-new Date(a.createdAt)) : 0);

  return res.status(200).json({ quotes });
});
