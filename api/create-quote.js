// /api/create-quote.js
import { withCORS } from './_lib/cors.js';
import { Client } from '@hubspot/api-client';

const QUOTE_TEMPLATE_ID = '140428159971';

function generateQuoteComment(tier, lineItems) {
  const tierMap = {
    'Tier1': 'Solo',
    'Tier2': 'Plus',
    'Tier3': 'Pro',
    'Tier4': 'Max'
  };
  
  const tierName = tierMap[tier] || tier;
  const productNames = lineItems.map(li => li.name).filter(Boolean);
  
  const hasWPF = productNames.some(p => p.includes('WPF'));
  const hasBudget = productNames.some(p => p.includes('Budżet'));
  const hasSWB = productNames.some(p => p.includes('SWB'));
  const hasUmowy = productNames.some(p => p.includes('Umowy'));
  
  const modules = [];
  if (hasWPF) modules.push('ePublink WPF');
  if (hasBudget) modules.push('Budżet');
  if (hasSWB) modules.push('SWB');
  if (hasUmowy) modules.push('Umowy');
  
  const modulesText = modules.length > 0 ? modules.join(', ') : 'wybrane moduły';
  const extraUsers = lineItems.find(li => li.name && li.name.includes('Dodatkowy użytkownik'));
  const extraUsersQty = extraUsers ? extraUsers.quantity : 0;
  
  let comment = `Wybierając tę ofertę, otrzymują Państwo:\n\n`;
  comment += `• dostęp do modułów ${modulesText} w ramach planu ${tierName.toUpperCase()} (szczegóły na www.publink.com/cennik)\n\n`;
  comment += `Wsparcie i wiedza:\n`;
  
  if (tier === 'Tier1') {
    comment += `✅ pomoc techniczna przez chat i mail\n`;
    comment += `✅ wydłużone wsparcie pomiędzy 1 a 15 listopada do godziny 18:00\n`;
    comment += `✅ materiały szkoleniowe do samodzielnej nauki\n`;
    comment += `✅ dostęp do bazy wiedzy\n`;
    comment += `✅ regularne szkolenia grupowe\n`;
  } else if (tier === 'Tier2') {
    comment += `Wszystko co w pakiecie SOLO oraz...\n`;
    comment += `✅ umawiane konsultacje telefoniczne - dla roli "Skarbnika"\n`;
    comment += `✅ pomoc przez chat i mail - dla pozostałych użytkowników\n`;
    comment += `✅ opiekun wdrożenia - indywidualnie dla w uruchomieniu platformy\n`;
  } else if (tier === 'Tier3') {
    comment += `Wszystko co w pakiecie PLUS oraz...\n`;
    comment += `✅ stała infolinia ekspercka - dla roli "Skarbnika"\n`;
    comment += `✅ umawiane konsultacje telefoniczne - dla wszystkich użytkowników w Urzędzie\n`;
    comment += `✅ gwarancja spokoju w najbardziej wymagających momentach roku - dyżury obsługi 11 listopada i 31 grudnia\n`;
  } else if (tier === 'Tier4') {
    comment += `Wszystko co w pakiecie PRO oraz...\n`;
    comment += `✅ dedykowany opiekun klienta\n`;
    comment += `✅ konsultacje telefoniczne dla wszystkich użytkowników\n`;
    comment += `✅ gwarancja spokoju przez cały rok - dyżury obsługi przez wszystkie dni wolne\n`;
    comment += `✅ priorytetowe wsparcie\n`;
  }
  
  comment += `\n`;
  comment += `Wliczeni użytkownicy:\n`;
  
  if (tier === 'Tier1') {
    comment += `✅ 1 użytkownik\n`;
    comment += `📌 każdy kolejny użytkownik 590 zł rocznie (netto)`;
    if (extraUsersQty > 0) comment += ` - w ofercie: ${extraUsersQty} dodatkowych użytkowników`;
    comment += `\n`;
  } else if (tier === 'Tier2') {
    comment += `✅ do 10 użytkowników w urzędzie\n`;
    comment += `✅ do 10 użytkowników w JO\n`;
    comment += `📌 każdy kolejny użytkownik 690 zł rocznie (netto)`;
    if (extraUsersQty > 0) comment += ` - w ofercie: ${extraUsersQty} dodatkowych użytkowników`;
    comment += `\n`;
  } else if (tier === 'Tier3') {
    comment += `✅ do 30 użytkowników w urzędzie\n`;
    comment += `✅ do 30 użytkowników w JO\n`;
    comment += `📌 każdy kolejny użytkownik 890 zł rocznie (netto)`;
    if (extraUsersQty > 0) comment += ` - w ofercie: ${extraUsersQty} dodatkowych użytkowników`;
    comment += `\n`;
  } else if (tier === 'Tier4') {
    comment += `✅ nieograniczona liczba użytkowników w urzędzie i JO\n`;
  }
  
  return comment;
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
    
    // 2. QUOTE TEMPLATE - używamy PUT endpoint z fetch
    console.log('Adding template association using fetch...');
    const templateResponse = await fetch(
      `https://api.hubapi.com/crm/v4/objects/quote/${quote.id}/associations/quote_template/${QUOTE_TEMPLATE_ID}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([
          { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 286 }
        ])
      }
    );
    
    if (!templateResponse.ok) {
      const errorText = await templateResponse.text();
      console.error('Template association failed:', errorText);
      throw new Error(`Template association failed: ${errorText}`);
    }
    
    console.log('✅ Template association added');
    
    // 3. Line items
    for (const lineItem of createdLineItems) {
      await hubspotClient.crm.associations.v4.basicApi.create(
        'quote', quote.id, 'line_item', lineItem.id,
        [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 67 }]
      );
    }
    
    // 4. Company (optional) - POPRAWIONY ID NA 71
    if (companyIds.length > 0) {
      for (const companyId of companyIds) {
        try {
          await hubspotClient.crm.associations.v4.basicApi.create(
            'quote', quote.id, 'company', companyId,
            [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 71 }]
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
