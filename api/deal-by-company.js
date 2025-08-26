const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

const PIPELINE_ID = '1978057944';

module.exports = withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    // 1) Pobierz powiązania Company -> Deals bez filtrowania po typeId
    const assoc = await hsFetch(`/crm/v4/objects/companies/${companyId}/associations/deals`);

    const dealIds = (assoc?.results || []).map(r => r.id).filter(Boolean);

    if (!dealIds.length) {
      return res.status(200).json({ deal: null });
    }

    // 2) Pobierz każdy deal i zatrzymaj pierwszy z właściwym pipeline
    let found = null;
    for (const id of dealIds) {
      const d = await hsFetch(`/crm/v3/objects/deals/${id}?properties=dealname,pipeline,hubspot_owner_id`);
      if ((d?.properties?.pipeline || '') === PIPELINE_ID) {
        found = d;
        break;
      }
    }

    if (!found) return res.status(200).json({ deal: null });

    // 3) Pobierz dane właściciela (owner)
    let owner = null;
    const oid = found?.properties?.hubspot_owner_id;
    if (oid) {
      try {
        const o = await hsFetch(`/crm/v3/owners/${encodeURIComponent(oid)}`);
        owner = {
          id: o.id || oid,
          name: o?.firstName && o?.lastName ? `${o.firstName} ${o.lastName}` : (o?.firstName || o?.lastName || o?.email || ''),
          email: o?.email || null
        };
      } catch (e) {
        owner = { id: oid, name: null, email: null };
      }
    }

    // Zwróć znaleziony deal
    return res.status(200).json({
      deal: {
        id: found.id,
        name: found?.properties?.dealname || '',
        pipelineId: found?.properties?.pipeline || null,
        owner
      }
    });

  } catch (e) {
    res.status(500).json({ error: 'deal-by-company failed', detail: String(e && e.message || e) });
  }
});
