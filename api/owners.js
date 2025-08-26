// /api/owners.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

module.exports = withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const owners = await hsFetch(`/crm/v3/owners?archived=false&limit=200`);
  const list = (owners?.results || []).map(o => ({
    id: o.id,
    name: o.firstName && o.lastName ? `${o.firstName} ${o.lastName}` : (o.email || `Owner ${o.id}`),
    email: o.email || null
  }));
  return res.status(200).json({ owners: list });
});
