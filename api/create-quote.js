const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

module.exports = withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // zbieranie body
  let raw = '';
  await new Promise((resolve, reject) => {
    req.on('data', chunk => (raw += chunk));
    req.on('end', resolve);
    req.on('error', reject);
  });
  let payload = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch (e) {}

  const { companyId, dealId, items, discountPLN, title, currency = 'PLN', locale = 'pl' } = payload;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items required' });

  // 1) Quote (DRAFT)
  const quote = await hsFetch('/crm/v3/objects/quotes', {
    method: 'POST',
    body: {
      properties: { hs_title: title || 'Oferta', hs_currency: currency, hs_locale: locale },
      associations: companyId ? [
        { to: { id: String(companyId) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 16 }] }
      ] : []
    }
  });
  const quoteId = quote.id;

  // 2) Line Items
  const createdLI = [];
  for (const it of items) {
    const body = { properties: { quantity: it.qty || 1 } };
    if (it.productId) body.properties.hs_product_id = String(it.productId);
    if (it.name) body.properties.name = it.name;
    if (typeof it.price === 'number') body.properties.price = it.price;
    const li = await hsFetch('/crm/v3/objects/line_items', { method: 'POST', body });
    createdLI.push(li.id);
  }

  if (discountPLN && discountPLN > 0) {
    const liDisc = await hsFetch('/crm/v3/objects/line_items', {
      method: 'POST',
      body: { properties: { name: 'Rabat pakietowy', quantity: 1, price: -Math.abs(discountPLN) } }
    });
    createdLI.push(liDisc.id);
  }

  // 3) Associate LI ↔ Quote (default)
  const assocInputs = createdLI.map(liId => ({ from: { id: String(quoteId) }, to: { id: String(liId) } }));
  await hsFetch('/crm/v4/associations/quotes/line_items/batch/associate/default', {
    method: 'POST',
    body: { inputs: assocInputs }
  });

  // 4) Return quote props (hs_public_url może wymagać publikacji w HS)
  const qData = await hsFetch(`/crm/v3/objects/quotes/${quoteId}`);
  res.status(200).json({ quoteId, properties: qData.properties });
});
