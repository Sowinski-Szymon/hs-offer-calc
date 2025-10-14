// /api/update-deal-line-items.js
import { withCORS } from './_lib/cors.js';
import { Client } from '@hubspot/api-client';

async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { dealId, lineItems } = req.body;
    const accessToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    
    if (!dealId || !lineItems) {
      return res.status(400).json({ error: 'dealId and lineItems required' });
    }
    if (!accessToken) {
      console.error('Błąd konfiguracji serwera: Brak HUBSPOT_PRIVATE_APP_TOKEN.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const hubspotClient = new Client({ accessToken });
    
    // Krok 1: Pobierz istniejące line items dla deala
    const associations = await hubspotClient.crm.deals.associationsApi.getAll(
      dealId,
      'line_items'
    );
    
    const existingLineItemIds = associations.results?.map(r => r.id) || [];
    
    // Krok 2: Usuń wszystkie istniejące line items
    for (const lineItemId of existingLineItemIds) {
      try {
        await hubspotClient.crm.lineItems.basicApi.archive(lineItemId);
      } catch (archiveError) {
        console.warn(`Nie udało się usunąć line item ${lineItemId}:`, archiveError.message);
      }
    }
    
    // Krok 3: Utwórz nowe line items
    const createdLineItems = [];
    
    for (const item of lineItems) {
      try {
        const lineItemData = {
          properties: {
            hs_product_id: String(item.productId),
            quantity: String(item.quantity || 1),
            price: String(item.price || 0),
            discount: String(item.discount || 0),
            rodzaj_arr: String(item.rodzaj_arr || '')
          },
          associations: [
            {
              to: { id: dealId },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: 20 // Deal to Line Item
                }
              ]
            }
          ]
        };
        
        const createdLineItem = await hubspotClient.crm.lineItems.basicApi.create(lineItemData);
        createdLineItems.push({
          id: createdLineItem.id,
          productId: createdLineItem.properties.hs_product_id
        });
      } catch (createError) {
        console.error(`Błąd tworzenia line item dla produktu ${item.productId}:`, createError.message);
      }
    }

    return res.status(200).json({ 
      success: true,
      created: createdLineItems.length,
      lineItems: createdLineItems
    });
    
  } catch (e) {
    const errorMessage = e.body ? JSON.stringify(e.body) : e.message;
    console.error('--- BŁĄD w update-deal-line-items ---', errorMessage);
    return res.status(500).json({ 
      error: 'Failed to update line items', 
      detail: String(e?.message || e) 
    });
  }
}

export default withCORS(handler);
