// /api/create-quote.js
import { withCORS } from './_lib/cors.js';
import { Client } from '@hubspot/api-client';

const QUOTE_TEMPLATE_ID = '140428159971';

function generateQuoteComment(tier, lineItems) {
  // ... (bez zmian)
}

async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { dealId, lineItems, quoteName, expirationDate, tier } = req.body;
    const accessToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    
    if (!dealId || !lineItems || !lineItems.length) {
      return res.status(400).json({ error: 'dealId and lineItems required' });
    }
    if (!accessToken) {
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const hubspotClient = new Client({ accessToken });
    
    console.log('=== KROK 1: Pobieranie danych ===');
    const deal = await hubspotClient.crm.deals.basicApi.getById(
      dealId,
      ['dealname', 'amount', 'hubspot_owner_id']
    );
    
    const [companyAssoc, contactAssoc] = await Promise.all([
      hubspotClient.crm.associations.v4.basicApi.getPage('deal', dealId, 'company').catch(() => ({ results: [] })),
      hubspotClient.crm.associations.v4.basicApi.getPage('deal', dealId, 'contact').catch(() => ({ results: [] }))
    ]);
    
    const companyIds = companyAssoc.results?.map(r => r.toObjectId) || [];
    const contactIds = contactAssoc.results?.map(r => r.toObjectId) || [];
    
    console.log('=== KROK 2: Tworzenie line items ===');
    const createdLineItems = [];
    
    for (const item of lineItems) {
      const properties = {
        hs_product_id: String(item.productId),
        quantity: String(item.quantity || 1),
        price: String(item.price || 0),
        discount: String(item.discount || 0)
      };
      
      if (item.rodzaj_arr) {
        properties.rodzaj_arr = String(item.rodzaj_arr);
      }
      
      const createdLineItem = await hubspotClient.crm.lineItems.basicApi.create({ properties });
      createdLineItems.push(createdLineItem);
    }
    
    const totalAmount = createdLineItems.reduce((sum, li) => {
      const qty = Number(li.properties.quantity || 1);
      const price = Number(li.properties.price || 0);
      const discount = Number(li.properties.discount || 0);
      return sum + (qty * price - discount);
    }, 0);
    
    console.log('=== KROK 3: Tworzenie quote ===');
    const quote = await hubspotClient.crm.quotes.basicApi.create({
      properties: {
        hs_title: quoteName || `Oferta - ${new Date().toISOString().slice(0, 10)}`,
        hs_expiration_date: expirationDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).getTime(),
        hs_status: 'DRAFT',
        hs_language: 'pl'
      }
    });
    
    console.log(`✅ Created quote: ${quote.id}`);
    
    console.log('=== KROK 4: Dodawanie associations ===');
    
    // 1. Association z dealem
    await hubspotClient.crm.associations.v4.basicApi.create(
      'quote', quote.id, 'deal', dealId,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 64 }]
    );
    
    // 2. QUOTE TEMPLATE - używamy PUT endpoint według dokumentacji strona 2-3
    console.log('Adding template association using PUT...');
    const axios = require('axios');
    await axios.put(
      `https://api.hubapi.com/crm/v4/objects/quote/${quote.id}/associations/quote_template/${QUOTE_TEMPLATE_ID}`,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 286 }],
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // 3. Line items
    for (const lineItem of createdLineItems) {
      await hubspotClient.crm.associations.v4.basicApi.create(
        'quote', quote.id, 'line_item', lineItem.id,
        [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 67 }]
      );
    }
    
    // 4. Company (optional)
    if (companyIds.length > 0) {
      for (const companyId of companyIds) {
        try {
          await hubspotClient.crm.associations.v4.basicApi.create(
            'quote', quote.id, 'company', companyId,
            [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 70 }]
          );
        } catch (err) {
          console.warn(`Could not associate company ${companyId}`);
        }
      }
    }
    
    // 5. Contacts (optional)
    if (contactIds.length > 0) {
      for (const contactId of contactIds) {
        try {
          await hubspotClient.crm.associations.v4.basicApi.create(
            'quote', quote.id, 'contact', contactId,
            [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 69 }]
          );
        } catch (err) {
          console.warn(`Could not associate contact ${contactId}`);
        }
      }
    }
    
    console.log('✅ All associations added');
    
    // 6. Komentarz
    const quoteComment = generateQuoteComment(tier, lineItems);
    try {
      await hubspotClient.crm.objects.notes.basicApi.create({
        properties: {
          hs_note_body: quoteComment,
          hs_timestamp: Date.now()
        },
        associations: [
          { to: { id: quote.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] },
          { to: { id: dealId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }
        ]
      });
    } catch (noteError) {
      console.warn('Could not add note');
    }
    
    return res.status(200).json({ 
      success: true,
      quote: {
        id: quote.id,
        name: quote.properties.hs_title,
        status: quote.properties.hs_status,
        amount: totalAmount
      }
    });
      
  } catch (e) {
    console.error('Error:', e.message, e.response?.data);
    return res.status(500).json({ 
      error: 'Failed to create quote', 
      detail: e.message 
    });
  }
}

export default withCORS(handler);
