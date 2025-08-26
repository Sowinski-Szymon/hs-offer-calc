// /api/quote-details.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

module.exports = withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { quoteId } = req.query;
  if (!quoteId) return res.status(400).json({ error: 'quoteId required' });

  // get line_item ids associated to quote
  const assoc = await hsFetch(`/crm/v4/objects/quotes/${quoteId}/associations/line_items?limit=200`);
  const liIds = (assoc?.results || []).map(r => r.to?.id).filter(Boolean);
  if (!liIds.length) return res.status(200).json({ items: [] });

  const props = [
    'name',
    'quantity',
    'price',                // standard price
    'hs_discount_amount',   // discount amount if any
    'hs_discount_percentage',
    'amount'                // total for line (HubSpot computed)
  ];
  const batch = await hsFetch(`/crm/v3/objects/line_items/batch/read`, {
    method: 'POST',
    body: JSON.stringify({ properties: props, inputs: liIds.map(id => ({ id })) })
  });

  const items = (batch?.results || []).map(li => {
    const p = li.properties || {};
    const qty = Number(p.quantity || 1);
    const price = Number(p.price || 0);
    const discAmt = Number(p.hs_discount_amount || 0);
    const discPct = Number(p.hs_discount_percentage || 0);
    const total = Number(p.amount || (qty * price - discAmt));
    return {
      id: li.id,
      name: p.name || '',
      qty,
      unitPrice: price,
      discountAmount: discAmt,
      discountPercent: discPct,
      lineTotal: total
    };
  });

  return res.status(200).json({ items });
});
