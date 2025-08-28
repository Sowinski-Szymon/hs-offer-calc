import { withCORS } from './_lib/cors.js';
import { hsFetch } from './_lib/hs.js';

export default withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { dealId } = req.query;
    if (!dealId) return res.status(400).json({ error: 'dealId required' });

    // Krok 1: Pobierz ID wszystkich Ofert (Quotes) powiązanych z Dealem
    const assoc = await hsFetch(`/crm/v4/objects/deals/${dealId}/associations/quotes`);
    const quoteIds = (assoc?.results || []).map(r => r.to?.id).filter(Boolean);

    if (!quoteIds.length) {
      return res.status(200).json({ quotes: [] });
    }

    // Krok 2: Pobierz szczegóły tych Ofert za pomocą jednego zapytania batch
    const qProps = ['hs_title', 'hs_status', 'hs_public_url', 'hs_expiration_date', 'hs_total_amount', 'amount'];
    const qBatch = await hsFetch(`/crm/v3/objects/quotes/batch/read`, {
      method: 'POST',
      body: { properties: qProps, inputs: quoteIds.map(id => ({ id })) }
    });
    const quotesData = qBatch?.results || [];

    // Krok 3: Równolegle pobierz ID wszystkich Pozycji (Line Items) ze wszystkich Ofert
    const lineItemAssociationPromises = quotesData.map(q =>
      hsFetch(`/crm/v4/objects/quotes/${q.id}/associations/line_items`)
    );
    const lineItemAssociationResults = await Promise.all(lineItemAssociationPromises);

    const allLineItemIds = new Set();
    const quoteToLineItemIds = {}; // Mapa do łączenia danych: { quoteId: [liId1, liId2] }

    lineItemAssociationResults.forEach((assocLi, index) => {
      const quoteId = quotesData[index].id;
      const liIds = (assocLi?.results || []).map(r => r.to?.id).filter(Boolean);
      quoteToLineItemIds[quoteId] = liIds;
      liIds.forEach(id => allLineItemIds.add(id));
    });

    // Krok 4: Pobierz szczegóły wszystkich unikalnych Pozycji za pomocą jednego zapytania batch
    let lineItemsById = new Map();
    if (allLineItemIds.size > 0) {
      const liProps = ['name', 'quantity', 'price', 'hs_product_id', 'amount'];
      const liBatch = await hsFetch(`/crm/v3/objects/line_items/batch/read`, {
        method: 'POST',
        body: { properties: liProps, inputs: Array.from(allLineItemIds).map(id => ({ id })) }
      });
      (liBatch?.results || []).forEach(item => lineItemsById.set(item.id, item));
    }

    // Krok 5: Złóż ostateczną odpowiedź, łącząc dane w pamięci
    const quotes = quotesData.map(r => {
      const relatedLineItemIds = quoteToLineItemIds[r.id] || [];
      const lineItems = relatedLineItemIds.map(liId => {
        const li = lineItemsById.get(liId);
        if (!li) return null;
        
        const p = li.properties || {};
        return {
          id: li.id,
          name: p.name || '',
          qty: Number(p.quantity || 0),
          unitPrice: Number(p.price || 0),
          lineTotal: Number(p.amount || 0),
          productId: p.hs_product_id
        };
      }).filter(Boolean);

      return {
        id: r.id,
        name: r.properties?.hs_title || `Quote ${r.id}`,
        status: r.properties?.hs_status || null,
        publicUrl: r.properties?.hs_public_url || null,
        amount: Number(r.properties?.hs_total_amount || r.properties?.amount || 0),
        createdAt: r.properties?.hs_createdate || null,
        expiresAt: r.properties?.hs_expiration_date || null,
        lineItems: lineItems
      };
    });

    // Sortuj oferty od najnowszej do najstarszej
    quotes.sort((a, b) => (b.createdAt && a.createdAt) ? (new Date(b.createdAt) - new Date(a.createdAt)) : 0);

    return res.status(200).json({ quotes });

  } catch (e) {
    console.error(`--- BŁĄD w /api/quotes-by-deal.js ---`, e.message);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      detail: 'Failed to fetch quotes and line items.' 
    });
  }
});
