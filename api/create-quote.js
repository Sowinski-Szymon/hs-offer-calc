// /api/create-quote.js

// ZMIANA: Użycie 'import' zamiast 'require' i dodanie rozszerzenia .js
import { withCORS } from './_lib/cors.js';
import { hsFetch } from './_lib/hs.js';

// ZMIANA: Użycie 'export default' zamiast 'module.exports'
export default withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const body = req.body || {};
    const { companyId, dealId, ownerId, title, items, discountPLN } = body;

    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items required' });

    // 1) Utwórz DRAFT Quote
    const quoteCreate = await hsFetch(`/crm/v3/objects/quotes`, {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_title: title || 'Oferta',
          hs_status: 'DRAFT',
          ...(ownerId ? { hubspot_owner_id: String(ownerId) } : {})
        },
        associations: [
          { to: { id: String(companyId) }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 280 }] }
        ]
      })
    });

    const quoteId = String(quoteCreate.id);

    // 2) Jeżeli mamy deal — skojarz quote z dealem
    if (dealId) {
      await hsFetch(`/crm/v4/objects/quotes/${quoteId}/associations/deals/${dealId}`, {
        method: 'PUT',
        body: JSON.stringify({
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 280 }]
        })
      });
    }

    // 3) Dodaj pozycje (line items) – z produktów katalogowych
    for (const it of items) {
      const { productId, qty } = it;
      if (!productId) continue;

      const li = await hsFetch(`/crm/v3/objects/line_items`, {
        method: 'POST',
        body: JSON.stringify({
          properties: {
            hs_product_id: String(productId),
            quantity: String(qty || 1)
          }
        })
      });

      await hsFetch(`/crm/v4/objects/quotes/${quoteId}/associations/line_items/${li.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 280 }]
        })
      });
    }

    // 4) Linia „Rabat pakietowy” jako dodatkowy line_item (ujemna cena)
    const rabat = Number(discountPLN || 0);
    if (rabat > 0) {
      const liDisc = await hsFetch(`/crm/v3/objects/line_items`, {
        method: 'POST',
        body: JSON.stringify({
          properties: {
            name: 'Rabat pakietowy',
            price: String(-rabat),
            quantity: '1'
          }
        })
      });

      await hsFetch(`/crm/v4/objects/quotes/${quoteId}/associations/line_items/${liDisc.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 280 }]
        })
      });
    }

    // 5) Zwróć świeżo utworzony Quote
    const q = await hsFetch(`/crm/v3/objects/quotes/${quoteId}?properties=hs_title,hs_status,hs_public_url`);

    return res.status(200).json({
      quoteId,
      properties: q.properties || {}
    });
  } catch (e) {
    return res.status(500).json({ error: 'create-quote failed', detail: String(e?.message || e) });
  }
});
