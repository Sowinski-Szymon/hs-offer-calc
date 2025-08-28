// Importy
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

    // Inicjalizacja klienta HubSpot
    console.log(`🚀 Inicjalizacja klienta HubSpot...`);
    const hubspotClient = new hubspot.Client({
      accessToken,
      basePath: 'eu1' // zamiast pełnego URL podajemy region
    });

    // Krok 1: Pobierz ID Quote’ów powiązanych z Dealem
    const assocResponse = await hubspotClient.crm.associations.v4.basicApi.getPage(
      'deals',
      dealId,
      'quotes',
      {}
    );
    const quoteIds = (assocResponse.results || [])
      .map(r => r.toObjectId)
      .filter(Boolean);

    if (!quoteIds.length) {
      return res.status(200).json({ quotes: [] });
    }

    // Krok 2: Pobierz szczegóły Quote’ów
    const qProps = ['hs_title', 'hs_status', 'hs_public_url', 'hs_expiration_date', 'hs_createdate', 'hs_total_amount', 'amount'];
    const qBatch = await hubspotClient.crm.quotes.batchApi.read({
      inputs: quoteIds.map(id => ({ id })),
      properties: qProps
    });
    const quotesData = qBatch.results || [];

    // Krok 3: Równolegle pobierz ID Line Itemów
    const lineItemAssociationPromises = quotesData.map(q =>
      hubspotClient.crm.associations.v4.basicApi.getPage(
        'quotes',
        q.id,
        'line_items',
        {}
      )
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

    // Krok 4: Pobierz szczegóły Line Itemów
    let lineItemsById = new Map();
    if (allLineItemIds.size > 0) {
      const liProps = ['name', 'quantity', 'price', 'hs_product_id', 'amount'];
      const liBatch = await hubspotClient.crm.lineItems.batchApi.read({
        inputs: Array.from(allLineItemIds).map(id => ({ id })),
        properties: liProps
      });
      (liBatch.results || []).forEach(item => lineItemsById.set(item.id, item));
    }

    // Funkcja do parsowania dat (ISO albo timestamp w ms)
    const parseDate = (d) => {
      if (!d) return null;
      return isNaN(d) ? new Date(d) : new Date(Number(d));
    };

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

    // Sortowanie po dacie utworzenia
    quotes.sort((a, b) => (b.createdAt && a.createdAt) ? (parseDate(b.createdAt) - parseDate(a.createdAt)) : 0);

    return res.status(200).json({ quotes });

  } catch (e) {
    const errorMessage =
      e.body ||
      e.response?.body ||
      e.message ||
      e.toString();

    console.error(`--- BŁĄD w /api/quotes-by-deal.js ---`, errorMessage);
    return res.status(500).json({
      error: 'Internal Server Error',
      detail: 'Failed to fetch quotes and line items.',
      originalError: errorMessage
    });
  }
});
