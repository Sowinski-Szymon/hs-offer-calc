const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

module.exports = withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const companyId = req.query.companyId;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });

  // 1) Companies -> Deals
  const assocDeals = await hsFetch(`/crm/v4/objects/companies/${companyId}/associations/deals`);
  const dealIds = (assocDeals.results || []).map(r => r.toObjectId || (r.to && r.to.id)).filter(Boolean);
  if (!dealIds.length) return res.status(200).json({ ownedMainProducts: [], ownedLineItems: [] });

  // 2) Deals batch → filtr Closed-Won (heurystyka)
  const dealsBatch = await hsFetch('/crm/v3/objects/deals/batch/read', {
    method: 'POST',
    body: { properties: ['dealstage'], inputs: dealIds.map(id => ({ id })) }
  });
  const closedWonIds = new Set((dealsBatch.results || [])
    .filter(d => String(d.properties?.dealstage || '').toLowerCase().includes('closedwon'))
    .map(d => d.id));
  const targetDealIds = closedWonIds.size ? Array.from(closedWonIds) : dealIds;

  // 3) Deals -> Line Items
  const allLineItemIds = [];
  for (const id of targetDealIds) {
    const liAssoc = await hsFetch(`/crm/v4/objects/deals/${id}/associations/line_items`);
    const ids = (liAssoc.results || []).map(x => x.toObjectId || (x.to && x.to.id)).filter(Boolean);
    allLineItemIds.push(...ids);
  }
  if (!allLineItemIds.length) return res.status(200).json({ ownedMainProducts: [], ownedLineItems: [] });

  // 4) Line items batch → hs_product_id
  const uniqLiIds = Array.from(new Set(allLineItemIds)).slice(0, 1000);
  const liBatch = await hsFetch('/crm/v3/objects/line_items/batch/read', {
    method: 'POST',
    body: { properties: ['hs_product_id', 'name'], inputs: uniqLiIds.map(id => ({ id })) }
  });
  const productIds = Array.from(new Set((liBatch.results || []).map(li => li.properties?.hs_product_id).filter(Boolean)));
  if (!productIds.length) return res.status(200).json({ ownedMainProducts: [], ownedLineItems: uniqLiIds });

  // 5) Products batch → is_main_product
  const prodBatch = await hsFetch('/crm/v3/objects/products/batch/read', {
    method: 'POST',
    body: { properties: ['name', 'sku', 'is_main_product'], inputs: productIds.map(id => ({ id })) }
  });

  const mainOwnedKeys = new Set();
  for (const p of (prodBatch.results || [])) {
    const isMain = String(p.properties?.is_main_product).toLowerCase() === 'true';
    if (isMain) {
      const sku = p.properties?.sku || '';
      const name = p.properties?.name || '';
      const key = sku.split('-')[0] ||
                  (name.match(/ePublink\s+(WPF|Budżet|Umowy|SWB)/i)?.[1] || '')
                    .toUpperCase().replace('BUDŻET', 'BUDZET');
      if (key) mainOwnedKeys.add(key);
    }
  }

  res.status(200).json({ ownedMainProducts: Array.from(mainOwnedKeys), ownedLineItems: uniqLiIds });
});
