// /api/deal-line-items.js
import { withCORS } from './_lib/cors.js';
import { Client } from '@hubspot/api-client';

async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { dealId } = req.query;
    const accessToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    
    if (!dealId) return res.status(400).json({ error: 'dealId required' });
    if (!accessToken) {
      console.error('Błąd konfiguracji serwera: Brak HUBSPOT_PRIVATE_APP_TOKEN.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const hubspotClient = new Client({ accessToken });
    
    // Pobierz line items powiązane z dealem przez associations
    const associations = await hubspotClient.crm.deals.associationsApi.getAll(
      dealId,
      'line_items'
    );
    
    if (!associations.results || associations.results.length === 0) {
      return res.status(200).json({ lineItems: [] });
    }
    
    const lineItemIds = associations.results.map(assoc => assoc.id);
    
    // Pobierz szczegóły każdego line item
    const lineItemsPromises = lineItemIds.map(lineItemId =>
      hubspotClient.crm.lineItems.basicApi.getById(
        lineItemId,
        ['name', 'hs_product_id', 'price', 'quantity', 'discount', 'amount', 'rodzaj_arr']
      )
    );
    
    const lineItemsResults = await Promise.all(lineItemsPromises);
    
    const lineItems = lineItemsResults.map(li => ({
      id: li.id,
      productId: li.properties.hs_product_id || '',
      name: li.properties.name || '',
      quantity: li.properties.quantity || '1',
      price: li.properties.price || '0',
      discount: li.properties.discount || '0',
      amount: li.properties.amount || '0',
      rodzaj_arr: li.properties.rodzaj_arr || ''
    }));

    return res.status(200).json({ lineItems });
    
  } catch (e) {
    const errorMessage = e.body ? JSON.stringify(e.body) : e.message;
    console.error('--- BŁĄD w deal-line-items ---', errorMessage);
    return res.status(500).json({ 
      error: 'Failed to fetch line items', 
      detail: String(e?.message || e) 
    });
  }
}

export default withCORS(handler);
