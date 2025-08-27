// /api/quotes-by-deal.js

// ZMIANA: Użycie 'import' zamiast 'require' i dodanie rozszerzenia .js
import { withCORS } from './_lib/cors.js';
import { hsFetch } from './_lib/hs.js';

// ZMIANA: Użycie 'export default' zamiast 'module.exports'
export default withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { dealId } = req.query;
    if (!dealId) return res.status(400).json({ error: 'dealId required' });

    // 1) Assoc v4: Deal -> Quotes
    const assoc = await hsFetch(`/crm/v4/objects/deals/${dealId}/associations/quotes`);
    const quoteIds = (assoc?.results || []).map(r => r.to?.id).filter(Boolean);

    if (!quoteIds.length) return res.status(200).json({ quotes: [] });

    // 2) Batch read quotes
    const qProps = ['hs_title', 'hs_status', 'hs_public_url', 'hs_expiration_date', 'hs_total_amount', 'amount'];
    const qBatch = await hsFetch(`/crm/v3/objects/quotes/batch/read`, {
      method: 'POST',
      body: {
        properties: qProps,
        inputs: quoteIds.map(id => ({ id }))
      }
    });

    const quotesRaw = (qBatch?.results || []).map(r => ({
      id: r.id,
      title: r.properties?.hs_title || r.properties?.name || `Quote ${r.id}`,
      status: r.properties?.hs_status || null,
      publicUrl: r.properties?.hs_public_url || null,
      amount: Number(r.properties?.hs_total_amount || r.properties?.amount || 0),
      expiration: r.properties?.hs_expiration_date || null
    }));

    // 3) Dla każdego quote -> assoc v4 -> line items
    const lineItemsByQuote = {};
    for (const q of quotesRaw) {
      const assocLi = await hsFetch(`/crm/v4/objects/quotes/${q.id}/associations/line_items`);
      const liIds = (assocLi?.results || []).map(r => r.to?.id).filter(Boolean);
      if (!liIds.length) { lineItemsByQuote[q.id] = []; continue; }

      const liProps = ['name', 'quantity', 'price', 'hs_discount_percentage', 'hs_discount'];
      const liBatch = await hsFetch(`/crm/v3/objects/line_items/batch/read`, {
        method: 'POST',
        body: {
          properties: liProps,
          inputs: liIds.map(id => ({ id }))
        }
      });

      const items = (liBatch?.results || []).map(li => {
        const p = li.properties || {};
        const qty = Number(p.quantity || 0);
        const unit = Number(p.price || 0);
        const discPct = p.hs_discount_percentage != null ? Number(p.hs_discount_percentage) : null;
        const discAmt = p.hs_discount != null ? Number(p.hs_discount) : null;

        let lineTotal = qty * unit;
        if (discPct != null && !isNaN(discPct)) {
          lineTotal = lineTotal * (1 - discPct / 100);
        } else if (discAmt != null && !isNaN(discAmt)) {
          lineTotal = Math.max(0, lineTotal - discAmt);
        }

        return {
          id: li.id,
          name: p.name || '',
          qty,
          unitPrice: unit,
          discountPercent: discPct != null ? discPct : 0,
          discountAmount: discAmt != null ? discAmt : 0,
          lineTotal
        };
      });

      lineItemsByQuote[q.id] = items;
    }

    const quotes = quotesRaw.map(q => ({
      ...q,
      lineItems: lineItemsByQuote[q.id] || []
    }));

    res.status(200).json({ quotes });

  } catch (e) {
    res.status(500).json({ error: 'quotes-by-deal failed', detail: String(e?.message || e) });
  }
});
