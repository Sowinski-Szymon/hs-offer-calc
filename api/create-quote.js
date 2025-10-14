// /api/create-quote.js
import { withCORS } from './_lib/cors.js';
import { Client } from '@hubspot/api-client';

async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { dealId, lineItems, quoteName, expirationDate } = req.body;
    const accessToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    
    if (!dealId || !lineItems || !lineItems.length) {
      return res.status(400).json({ error: 'dealId and lineItems required' });
    }
    if (!accessToken) {
      console.error('Błąd konfiguracji serwera: Brak HUBSPOT_PRIVATE_APP_TOKEN.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const hubspotClient = new Client({ accessToken });
    
    try {
      console.log('Creating quote for deal:', dealId);
      
      // Krok 1: Utwórz tymczasowe line items dla quote
      const createdLineItems = [];
      
      for (const item of lineItems) {
        try {
          console.log('Creating line item for quote:', item);
          
          const properties = {
            hs_product_id: String(item.productId),
            quantity: String(item.quantity || 1),
            price: String(item.price || 0),
            discount: String(item.discount || 0)
          };
          
          if (item.rodzaj_arr) {
            properties.rodzaj_arr = String(item.rodzaj_arr);
          }
          
          const createdLineItem = await hubspotClient.crm.lineItems.basicApi.create({
            properties
          });
          
          console.log(`Created line item: ${createdLineItem.id}`);
          createdLineItems.push(createdLineItem);
          
        } catch (createError) {
          console.error(`Błąd tworzenia line item dla produktu ${item.productId}:`, createError.message);
          throw createError;
        }
      }
      
      // Krok 2: Oblicz całkowitą kwotę
      const totalAmount = createdLineItems.reduce((sum, li) => {
        const qty = Number(li.properties.quantity || 1);
        const price = Number(li.properties.price || 0);
        const discount = Number(li.properties.discount || 0);
        return sum + (qty * price - discount);
      }, 0);
      
      // Krok 3: Utwórz quote
      const quoteProperties = {
        hs_title: quoteName || `Quote - ${new Date().toISOString().slice(0, 10)}`,
        hs_expiration_date: expirationDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).getTime(),
        hs_status: 'DRAFT',
        amount: String(totalAmount)
      };
      
      const quote = await hubspotClient.crm.quotes.basicApi.create({
        properties: quoteProperties
      });
      
      console.log(`Created quote: ${quote.id}`);
      
      // Krok 4: Powiąż quote z dealem
      await hubspotClient.crm.associations.v4.basicApi.create(
        'quote',
        quote.id,
        'deal',
        dealId,
        [
          {
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 64 // Quote to Deal
          }
        ]
      );
      
      console.log(`Associated quote ${quote.id} with deal ${dealId}`);
      
      // Krok 5: Powiąż line items z quote
      for (const lineItem of createdLineItems) {
        await hubspotClient.crm.associations.v4.basicApi.create(
          'line_item',
          lineItem.id,
          'quote',
          quote.id,
          [
            {
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 67 // Line Item to Quote
            }
          ]
        );
        console.log(`Associated line item ${lineItem.id} with quote ${quote.id}`);
      }
      
      return res.status(200).json({ 
        success: true,
        quote: {
          id: quote.id,
          name: quote.properties.hs_title,
          status: quote.properties.hs_status,
          amount: quote.properties.amount
        }
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
    console.error('--- BŁĄD w create-quote ---', errorMessage);
    return res.status(500).json({ 
      error: 'Failed to create quote', 
      detail: String(e?.message || e) 
    });
  }
}

export default withCORS(handler);
