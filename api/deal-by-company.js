// /api/deal-by-company.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

// Stałe wg wymagań:
// const PIPELINE_ID = '1978057944'; // CELOWO WYŁĄCZONE do testów
// const PRIMARY_COMPANY_ASSOC_ID = 1; // CELOWO WYŁĄCZONE do testów

module.exports = withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    // 1) Pobierz powiązania Company -> Deals
    const assoc = await hsFetch(`/crm/v4/objects/companies/${companyId}/associations/deals`);
    
    // 2) Pobierz ID wszystkich powiązanych deali, BEZ filtrowania.
    const dealIds = (assoc?.results || [])
      .map(r => r.to?.id)
      .filter(Boolean);

    if (!dealIds.length) {
      // Jeśli nie znaleziono ŻADNEGO powiązanego deala, zwróć null.
      return res.status(200).json({ deal: null });
    }

    // 3) Pobierz PIERWSZY deal z listy, bez sprawdzania pipeline.
    const firstDealId = dealIds[0];
    const found = await hsFetch(`/crm/v3/objects/deals/${firstDealId}?properties=dealname,pipeline,hubspot_owner_id`);

    if (!found) {
      // To się nie powinno zdarzyć, jeśli dealIds[0] istnieje, ale dla bezpieczeństwa.
      return res.status(200).json({ deal: null });
    }

    // 4) Pobierz dane właściciela (owner)
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
      } catch(e) {
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
