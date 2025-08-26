// /api/deal-by-company.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

module.exports = withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { companyId, pipelineId } = req.query;
  if (!companyId || !pipelineId) return res.status(400).json({ error: 'companyId and pipelineId required' });

  // 1) deals associated with company
  const assoc = await hsFetch(`/crm/v4/objects/companies/${companyId}/associations/deals?limit=100`);
  const dealIds = (assoc?.results || []).map(r => r.to?.id).filter(Boolean);
  if (!dealIds.length) return res.status(200).json({ deal: null });

  // 2) read those deals and filter by pipeline
  const idsParam = dealIds.join(',');
  const props = ['dealname','pipeline','dealstage','hubspot_owner_id'];
  const dealsResp = await hsFetch(`/crm/v3/objects/deals/batch/read`, {
    method: 'POST',
    body: JSON.stringify({ properties: props, inputs: dealIds.map(id => ({ id })) })
  });

  const candidates = (dealsResp?.results || []).filter(d => d.properties?.pipeline === pipelineId);
  if (!candidates.length) return res.status(200).json({ deal: null });

  candidates.sort((a, b) => (b.updatedAt && a.updatedAt) ? (new Date(b.updatedAt) - new Date(a.updatedAt)) : 0);
  const d = candidates[0];
  return res.status(200).json({
    deal: {
      id: d.id,
      name: d.properties?.dealname || '',
      pipeline: d.properties?.pipeline || '',
      stage: d.properties?.dealstage || '',
      ownerId: d.properties?.hubspot_owner_id || null
    }
  });
});
