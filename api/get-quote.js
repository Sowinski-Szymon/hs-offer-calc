// /api/quote-details.js (przykładowa nazwa pliku)

// ZMIANA: Użycie 'import' zamiast 'require' i dodanie rozszerzenia .js
import { withCORS } from './_lib/cors.js';
import { hsFetch } from './_lib/hs.js';

// ZMIANA: Użycie 'export default' zamiast 'module.exports'
export default withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const quoteId = req.query.quoteId;
  if (!quoteId) return res.status(400).json({ error: 'quoteId required' });

  const quote = await hsFetch(`/crm/v3/objects/quotes/${quoteId}`);

  const liAssoc = await hsFetch(`/crm/v4/objects/quotes/${quoteId}/associations/line_items`);
  const liIds = (liAssoc.results || []).map(x => x.toObjectId || (x.to && x.to.id)).filter(Boolean);

  let items = [];
  if (liIds.length) {
    const liBatch = await hsFetch('/crm/v3/objects/line_items/batch/read', {
      method: 'POST',
      body: { inputs: liIds.map(id => ({ id })), properties: ['name', 'quantity', 'price', 'amount', 'hs_product_id'] }
    });
    items = (liBatch.results || []).map(r => ({
      id: r.id,
      name: r.properties?.name,
      qty: Number(r.properties?.quantity || 1),
      price: Number(r.properties?.price || 0),
      amount: Number(r.properties?.amount || 0),
      productId: r.properties?.hs_product_id
    }));
  }

  res.status(200).json({ quote: { id: quote.id, properties: quote.properties }, items });
});
