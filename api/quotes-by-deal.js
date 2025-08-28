// ZMIANA: Importujemy cały moduł, aby używać składni `hubspot.Client`
import { withCORS } from '../_lib/cors.js';
import hubspot from '@hubspot/api-client';

export default withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { dealId } = req.query;
    if (!dealId) return res.status(400).json({ error: 'dealId required' });
    
    const accessToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    if (!accessToken) {
        console.error('KRYTYCZNY BŁĄD: Brak HUBSPOT_PRIVATE_APP_TOKEN w zmiennych środowiskowych Vercel.');
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    // ZMIANA: Dodajemy log i używamy składni `new hubspot.Client`
    console.log(`🚀 Inicjalizacja klienta HubSpot...`);
    const hubspotClient = new hubspot.Client({ 
      accessToken,
      basePath: 'https://api.hubapi.eu'
    });

    // Krok 1: Pobierz ID Ofert powiązanych z Dealem
    const assocResponse = await hubspotClient.crm.associations.v4.basicApi.getPage('deals', dealId, 'quotes');
    const quoteIds = (assocResponse.results || []).map(r => r.toObjectId).filter(Boolean);

    if (!quoteIds.length) {
      return res.status(200).json({ quotes: [] });
    }

    // Krok 2: Pobierz szczegóły Ofert
    const qProps = ['hs_title', 'hs_status', 'hs_public_url', 'hs_expiration_date', 'hs_createdate', 'hs_total_amount', 'amount'];
    const qBatch = await hubspotClient.crm.quotes.batchApi.read({ 
        properties: qProps, 
        inputs: quoteIds.map(id => ({ id })) 
    });
    const quotesData = qBatch.results || [];

    // Krok 3: Równolegle pobierz ID Pozycji (Line Items)
    const lineItemAssociationPromises = quotesData.map(q =>
        hubspotClient.crm.associations.v4.basicApi.getPage('quotes', q.id, 'line_items')
    );
    const lineItemAssociationResults = await Promise.all(lineItemAssociationPromises);

    const allLineItemIds = new Set();
    const quoteToLineItemIds = {};
    lineItemAssociationResults.forEach((assocLi, index) => {
      const quoteId = quotesData[index].id;
      const liIds = (assocLi?.results || []).map(r => r.toObjectId).filter(Boolean);
      quoteToLineItemIds[quoteId] = liIds;
      liIds.forEach(id => allLineItemIds.add(id));
    });

    // Krok 4: Pobierz szczegóły Pozycji
    let lineItemsById = new Map();
    if (allLineItemIds.size > 0) {
      const liProps = ['name', 'quantity', 'price', 'hs_product_id', 'amount'];
      const liBatch = await hubspotClient.crm.lineItems.batchApi.read({ 
          properties: liProps, 
          inputs: Array.from(allLineItemIds).map(id => ({ id })) 
      });
      (liBatch.results || []).forEach(item => lineItemsById.set(item.id, item));
    }

    // Krok 5: Złóż ostateczną odpowiedź
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

    quotes.sort((a, b) => (b.createdAt && a.createdAt) ? (new Date(b.createdAt) - new Date(a.createdAt)) : 0);

    return res.status(200).json({ quotes });

  } catch (e) {
    const errorMessage = e.body ? JSON.stringify(e.body) : String(e.message || e);
    console.error(`--- BŁĄD w /api/quotes-by-deal.js ---`, errorMessage);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      detail: 'Failed to fetch quotes and line items.',
      originalError: errorMessage
    });
  }
});
