// /api/quotes-by-deal.js

import { withCORS } from './_lib/cors.js';
import { hsFetch } from './_lib/hs.js';

export default withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { dealId } = req.query;
    if (!dealId) return res.status(400).json({ error: 'dealId required' });

    // Krok 1: Pobierz ID wszystkich ofert powiązanych z dealem
    const assoc = await hsFetch(`/crm/v4/objects/deals/${dealId}/associations/quotes`);
    const quoteIds = (assoc?.results || []).map(r => r.to?.id).filter(Boolean);
    if (!quoteIds.length) return res.status(200).json({ quotes: [] });

    // Krok 2: Pobierz szczegóły wszystkich ofert za jednym razem
    const qProps = ['hs_title', 'hs_status', 'hs_public_url', 'hs_expiration_date', 'hs_total_amount', 'amount'];
    const qBatch = await hsFetch(`/crm/v3/objects/quotes/batch/read`, {
      method: 'POST',
      body: { properties: qProps, inputs: quoteIds.map(id => ({ id })) }
    });
    const quotesRaw = (qBatch?.results || []);

    // Krok 3: Pobierz ID wszystkich pozycji (line items) ze wszystkich ofert równolegle
    const lineItemAssociations = await Promise.all(
      quotesRaw.map(q => hsFetch(`/crm/v4/objects/quotes/${q.id}/associations/line_items`))
    );
    
    const allLineItemIds = new Set();
    const quoteToLineItemIds = {}; // Mapa do późniejszego łączenia danych

    lineItemAssociations.forEach((assocLi, index) => {
      const quoteId = quotesRaw[index].id;
      const liIds = (assocLi?.results || []).map(r => r.to?.id).filter(Boolean);
      quoteToLineItemIds[quoteId] = liIds;
      liIds.forEach(id => allLineItemIds.add(id));
    });

    // Krok 4: Pobierz szczegóły wszystkich unikalnych pozycji za jednym razem
    let allLineItems = [];
    if (allLineItemIds.size > 0) {
      const liProps = ['name', 'quantity', 'price', 'hs_discount_percentage', 'hs_discount'];
      const liBatch = await hsFetch(`/crm/v3/objects/line_items/batch/read`, {
        method: 'POST',
        body: { properties: liProps, inputs: Array.from(allLineItemIds).map(id => ({ id })) }
      });
      allLineItems = (liBatch?.results || []);
    }
    
    // Stwórz mapę pozycji dla szybkiego dostępu: { "lineItemId": { ...dane } }
    const lineItemsById = new Map(allLineItems.map(item => [item.id, item]));

    // Krok 5: Złóż ostateczną odpowiedź, łącząc dane w pamięci
    const quotes = quotesRaw.map(r => {
      const q = {
        id: r.id,
        title: r.properties?.hs_title || r.properties?.name || `Quote ${r.id}`,
        status: r.properties?.hs_status || null,
        publicUrl: r.properties?.hs_public_url || null,
        amount: Number(r.properties?.hs_total_amount || r.properties?.amount || 0),
        expiration: r.properties?.hs_expiration_date || null,
        lineItems: []
      };

      const relatedLineItemIds = quoteToLineItemIds[q.id] || [];
      q.lineItems = relatedLineItemIds.map(liId => {
        const li = lineItemsById.get(liId);
        if (!li) return null; // Zabezpieczenie na wypadek braku danych

        const p = li.properties || {};
        const qty = Number(p.quantity || 0);
        const unit = Number(p.price || 0);
        
        return {
          id: li.id,
          name: p.name || '',
          qty,
          unitPrice: unit,
          lineTotal: qty * unit // Uproszczone, możesz dodać logikę rabatów
        };
      }).filter(Boolean); // Usuń pozycje, których nie udało się znaleźć
      
      return q;
    });

    res.status(200).json({ quotes });

  } catch (e) {
    res.status(500).json({ error: 'quotes-by-deal failed', detail: String(e?.message || e) });
  }
});
