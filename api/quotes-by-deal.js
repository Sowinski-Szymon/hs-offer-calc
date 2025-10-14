// /api/quotes-by-deal.js
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
    
    try {
      // Pobierz associations deal->quote (API v4)
      const associations = await hubspotClient.crm.associations.v4.basicApi.getPage(
        'deal',
        dealId,
        'quote'
      );
      
      if (!associations.results || associations.results.length === 0) {
        console.log('Brak quotes dla deala:', dealId);
        return res.status(200).json({ quotes: [] });
      }
      
      const quoteIds = associations.results.map(assoc => assoc.toObjectId);
      console.log('Quote IDs dla deala', dealId, ':', quoteIds);
      
      // Pobierz szczegóły każdego quote
      const quotesPromises = quoteIds.map(async (quoteId) => {
        try {
          console.log('Pobieranie quote:', quoteId);
          
          // Pobierz quote z wszystkimi potrzebnymi properties
          const quote = await hubspotClient.crm.quotes.basicApi.getById(
            quoteId,
            [
              'hs_title',
              'hs_status',
              'hs_expiration_date',
              'hs_createdate',
              'amount',
              'hs_public_url_key'
            ]
          );
          
          console.log('Quote properties:', {
            id: quote.id,
            title: quote.properties.hs_title,
            status: quote.properties.hs_status,
            amount: quote.properties.amount
          });
          
          // Pobierz line items dla quote (API v4)
          let lineItemAssociations;
          try {
            lineItemAssociations = await hubspotClient.crm.associations.v4.basicApi.getPage(
              'quote',
              quoteId,
              'line_item'
            );
          } catch (assocError) {
            console.log(`Brak line items dla quote ${quoteId}`);
            lineItemAssociations = { results: [] };
          }
          
          const lineItemIds = lineItemAssociations.results?.map(r => r.toObjectId) || [];
          console.log(`Line item IDs dla quote ${quoteId}:`, lineItemIds);
          
          // Pobierz szczegóły line items
          let lineItems = [];
          if (lineItemIds.length > 0) {
            const lineItemsData = await Promise.all(
              lineItemIds.map(async (liId) => {
                try {
                  return await hubspotClient.crm.lineItems.basicApi.getById(
                    liId,
                    ['name', 'quantity', 'price', 'amount', 'discount']
                  );
                } catch (liError) {
                  console.error(`Błąd pobierania line item ${liId}:`, liError.message);
                  return null;
                }
              })
            );
            
            lineItems = lineItemsData
              .filter(li => li !== null)
              .map(li => ({
                name: li.properties.name || '—',
                qty: Number(li.properties.quantity || 1),
                unitPrice: Number(li.properties.price || 0),
                discount: Number(li.properties.discount || 0),
                lineTotal: Number(li.properties.amount || 0)
              }));
              
            console.log(`Pobrane line items dla quote ${quoteId}:`, lineItems.length);
          }
          
          // Oblicz całkowitą kwotę z line items
          const calculatedAmount = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
          
          // Użyj obliczonej kwoty jeśli są line items, inaczej z quote.amount
          const finalAmount = lineItems.length > 0 ? calculatedAmount : Number(quote.properties.amount || 0);
          
          console.log(`Quote ${quoteId} - kwota z properties: ${quote.properties.amount}, obliczona: ${calculatedAmount}, finalna: ${finalAmount}`);
          
          // Mapowanie statusów HubSpot na czytelne nazwy
          const statusMap = {
            'DRAFT': 'DRAFT',
            'APPROVAL_NOT_NEEDED': 'APPROVAL_NOT_NEEDED',
            'PENDING_APPROVAL': 'PENDING_APPROVAL',
            'APPROVED': 'APPROVED',
            'REJECTED': 'REJECTED',
            'SENT_NOT_ACCEPTED': 'SENT',
            'ACCEPTED': 'ACCEPTED'
          };
          
          const status = statusMap[quote.properties.hs_status] || quote.properties.hs_status || 'DRAFT';
          
          return {
            id: quote.id,
            name: quote.properties.hs_title || `Quote ${quote.id}`,
            status: status,
            amount: finalAmount,
            expirationDate: quote.properties.hs_expiration_date || null,
            createdAt: quote.properties.hs_createdate || null,
            publicUrl: quote.properties.hs_public_url_key 
              ? `https://app.hubspot.com/quotes/${quote.properties.hs_public_url_key}` 
              : null,
            lineItems
          };
        } catch (error) {
          console.error(`Błąd pobierania quote ${quoteId}:`, error.message);
          console.error('Stack:', error.stack);
          return null;
        }
      });
      
      const quotesResults = await Promise.all(quotesPromises);
      const validQuotes = quotesResults.filter(q => q !== null);
      
      console.log('Pobrane quotes:', validQuotes.length);
      console.log('Szczegóły quotes:', JSON.stringify(validQuotes, null, 2));

      return res.status(200).json({ quotes: validQuotes });
      
    } catch (apiError) {
      console.error('HubSpot API error details:', {
        message: apiError.message,
        body: apiError.body,
        statusCode: apiError.statusCode,
        stack: apiError.stack
      });
      throw apiError;
    }
    
  } catch (e) {
    const errorMessage = e.body ? JSON.stringify(e.body) : e.message;
    console.error('--- BŁĄD w quotes-by-deal ---', errorMessage);
    return res.status(500).json({ 
      error: 'Failed to fetch quotes', 
      detail: String(e?.message || e) 
    });
  }
}

export default withCORS(handler);
