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
    
    try {
      // Krok 1: Pobierz istniejące line items dla deala (API v4)
      const associations = await hubspotClient.crm.associations.v4.basicApi.getPage(
        'deal',
        dealId,
        'line_item'
      );
      
      const existingLineItemIds = associations.results?.map(r => r.toObjectId) || [];
      console.log('Existing line items to delete:', existingLineItemIds);
      
      // Krok 2: Usuń wszystkie istniejące line items
      for (const lineItemId of existingLineItemIds) {
        try {
          await hubspotClient.crm.lineItems.basicApi.archive(lineItemId);
          console.log(`Deleted line item: ${lineItemId}`);
        } catch (archiveError) {
          console.warn(`Nie udało się usunąć line item ${lineItemId}:`, archiveError.message);
        }
      }
      
      // Krok 3: Utwórz nowe line items
      const createdLineItems = [];
      
      for (const item of lineItems) {
        try {
          console.log('Creating line item:', item);
          
          // Przygotuj properties
          const properties = {
            hs_product_id: String(item.productId),
            quantity: String(item.quantity || 1),
            price: String(item.price || 0),
            discount: String(item.discount || 0)
          };
          
          // Dodaj rodzaj_arr tylko jeśli istnieje
          if (item.rodzaj_arr) {
            properties.rodzaj_arr = String(item.rodzaj_arr);
          }
          
          // Utwórz line item
          const createdLineItem = await hubspotClient.crm.lineItems.basicApi.create({
            properties
          });
          
          console.log(`Created line item: ${createdLineItem.id}`);
          
          // Krok 4: Utwórz association z dealem (API v4)
          await hubspotClient.crm.associations.v4.basicApi.create(
            'line_item',
            createdLineItem.id,
            'deal',
            dealId,
            [
              {
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 20 // Line Item to Deal
              }
            ]
          );
          
          console.log(`Associated line item ${createdLineItem.id} with deal ${dealId}`);
          
          createdLineItems.push({
            id: createdLineItem.id,
            productId: createdLineItem.properties.hs_product_id
          });
        } catch (createError) {
          console.error(`Błąd tworzenia line item dla produktu ${item.productId}:`, createError.message);
          console.error('Error details:', createError.body || createError);
        }
      }

      return res.status(200).json({ 
        success: true,
        created: createdLineItems.length,
        lineItems: createdLineItems
      });
      
    } catch (apiError) {
      console.error('HubSpot API error details:', {
        message: apiError.message,
        body: apiError.body,
        statusCode: apiError.statusCode
      });
      throw apiError;
    }
    
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
