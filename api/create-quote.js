// /api/create-quote.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

/**
 * BODY:
 * {
 *   companyId: "xxxx",                // wymagane
 *   dealId?: "yyyy",                  // opcjonalne (skojarzymy quote z dealem)
 *   ownerId?: "12345",                // opcjonalne (domyślnie właściciel deala)
 *   title?: "Oferta – ...",           // opcjonalne
 *   items: [ { productId: "PID", qty: 1 }, ... ],    // wymagane
 *   discountPLN?: 0                   // opcjonalnie dodajemy linię z rabatem kwotowym (ujemna)
 * }
 */
module.exports = withCORS(async (req, res) => {
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
          // quote -> company
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

    // 3) Dodaj pozycje (line items)
    for (const it of items) {
      const { productId, qty } = it;
      if (!productId) continue;

      // line_item -> z produktem z katalogu (wyciągnie cenę z katalogu)
      const li = await hsFetch(`/crm/v3/objects/line_items`, {
        method: 'POST',
        body: JSON.stringify({
          properties: {
            hs_product_id: String(productId),
            quantity: String(qty || 1)
          }
        })
      });

      // połącz line_item z quote
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
            price: String(-rabat),      // ujemna cena
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

    // 5) Zwróć świeżo utworzony Quote (minimalny zestaw pól)
    const q = await hsFetch(`/crm/v3/objects/quotes/${quoteId}?properties=hs_title,hs_status,hs_public_url`);

    return res.status(200).json({
      quoteId,
      properties: q.properties || {}
    });
  } catch (e) {
    return res.status(500).json({ error: 'create-quote failed', detail: String(e && e.message || e) });
  }
});
