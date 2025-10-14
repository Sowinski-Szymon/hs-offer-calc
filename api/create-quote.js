// /api/create-quote.js
import { withCORS } from './_lib/cors.js';
import { Client } from '@hubspot/api-client';

// Funkcja generująca komentarz na podstawie tiera i produktów
function generateQuoteComment(tier, lineItems) {
  const tierMap = {
    'Tier1': 'Solo',
    'Tier2': 'Plus',
    'Tier3': 'Pro',
    'Tier4': 'Max'
  };
  
  const tierName = tierMap[tier] || tier;
  const productNames = lineItems.map(li => li.name).filter(Boolean);
  
  // Identyfikuj moduły
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
  
  // Dodatkowi użytkownicy
  const extraUsers = lineItems.find(li => li.name && li.name.includes('Dodatkowy użytkownik'));
  const extraUsersQty = extraUsers ? extraUsers.quantity : 0;
  
  let comment = `Wybierając tę ofertę, otrzymują Państwo:\n\n`;
  comment += `• dostęp do modułów ${modulesText} w ramach planu ${tierName.toUpperCase()} (szczegóły na www.publink.com/cennik)\n\n`;
  
  // ===== WSPARCIE I WIEDZA =====
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
  
  // ===== WLICZENI UŻYTKOWNICY =====
  comment += `Wliczeni użytkownicy:\n`;
  
  if (tier === 'Tier1') {
    comment += `✅ 1 użytkownik\n`;
    comment += `📌 każdy kolejny użytkownik 590 zł rocznie (netto)`;
    if (extraUsersQty > 0) {
      comment += ` - w ofercie: ${extraUsersQty} dodatkowych użytkowników`;
    }
    comment += `\n`;
  } else if (tier === 'Tier2') {
    comment += `✅ do 10 użytkowników w urzędzie\n`;
    comment += `✅ do 10 użytkowników w JO\n`;
    comment += `📌 każdy kolejny użytkownik 690 zł rocznie (netto)`;
    if (extraUsersQty > 0) {
      comment += ` - w ofercie: ${extraUsersQty} dodatkowych użytkowników`;
    }
    comment += `\n`;
  } else if (tier === 'Tier3') {
    comment += `✅ do 30 użytkowników w urzędzie\n`;
    comment += `✅ do 30 użytkowników w JO\n`;
    comment += `📌 każdy kolejny użytkownik 890 zł rocznie (netto)`;
    if (extraUsersQty > 0) {
      comment += ` - w ofercie: ${extraUsersQty} dodatkowych użytkowników`;
    }
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

    const { dealId, lineItems, quoteName, expirationDate, dealOwnerId, tier } = req.body;
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
      console.log('Deal owner ID:', dealOwnerId);
      console.log('Tier:', tier);
      
      // Krok 1: Pobierz listę quote templates aby uzyskać domyślny template
      let defaultTemplateId = null;
      try {
        const templates = await hubspotClient.apiRequest({
          method: 'GET',
          path: '/crm/v3/objects/quote_template'
        });
        
        if (templates.results && templates.results.length > 0) {
          defaultTemplateId = templates.results[0].id;
          console.log('Found default quote template:', defaultTemplateId);
        }
      } catch (templateError) {
        console.warn('Could not fetch quote templates:', templateError.message);
      }
      
      // Krok 2: Pobierz deal aby uzyskać owner, company i contact
      const deal = await hubspotClient.crm.deals.basicApi.getById(
        dealId,
        ['dealname', 'amount', 'hubspot_owner_id']
      );
      
      console.log('Deal data:', deal.properties);
      
      // Pobierz associations deala
      const [companyAssoc, contactAssoc] = await Promise.all([
        hubspotClient.crm.associations.v4.basicApi.getPage('deal', dealId, 'company').catch(() => ({ results: [] })),
        hubspotClient.crm.associations.v4.basicApi.getPage('deal', dealId, 'contact').catch(() => ({ results: [] }))
      ]);
      
      const companyIds = companyAssoc.results?.map(r => r.toObjectId) || [];
      const contactIds = contactAssoc.results?.map(r => r.toObjectId) || [];
      
      console.log('Company IDs from deal:', companyIds);
      console.log('Contact IDs from deal:', contactIds);
      
      if (companyIds.length === 0) {
        console.warn('WARNING: No company associated with deal');
      }
      if (contactIds.length === 0) {
        console.warn('WARNING: No contact associated with deal');
      }
      
      // Krok 3: Utwórz line items
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
      
      // Krok 4: Oblicz całkowitą kwotę
      const totalAmount = createdLineItems.reduce((sum, li) => {
        const qty = Number(li.properties.quantity || 1);
        const price = Number(li.properties.price || 0);
        const discount = Number(li.properties.discount || 0);
        return sum + (qty * price - discount);
      }, 0);
      
      // Krok 5: Generuj komentarz
      const quoteComment = generateQuoteComment(tier, lineItems);
      console.log('Generated quote comment (length):', quoteComment.length);
      
      // Krok 6: Utwórz quote z associations w jednym wywołaniu (API v3)
      const quoteProperties = {
        hs_title: quoteName || `Oferta - ${new Date().toISOString().slice(0, 10)}`,
        hs_expiration_date: expirationDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).getTime(),
        hs_status: 'DRAFT',
        hs_language: 'pl'
      };
      
      // Dodaj template jeśli znaleziono
      if (defaultTemplateId) {
        quoteProperties.hs_quote_template = String(defaultTemplateId);
      }
      
      // Ustaw ownera
      const finalOwnerId = dealOwnerId || deal.properties.hubspot_owner_id;
      if (finalOwnerId) {
        quoteProperties.hubspot_owner_id = String(finalOwnerId);
        console.log('Setting quote owner to:', finalOwnerId);
      } else {
        console.warn('WARNING: No owner found for quote');
      }
      
      console.log('Quote properties:', quoteProperties);
      
      // Przygotuj associations zgodnie z API v3
      const associations = [];
      
      // Association z dealem (REQUIRED)
      associations.push({
        to: { id: dealId },
        types: [{
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: 64 // Quote to Deal
        }]
      });
      
      // Associations z company (jeśli istnieje)
      companyIds.forEach(companyId => {
        associations.push({
          to: { id: companyId },
          types: [{
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 70 // Quote to Company
          }]
        });
      });
      
      // Associations z contacts (jeśli istnieje)
      contactIds.forEach(contactId => {
        associations.push({
          to: { id: contactId },
          types: [{
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 69 // Quote to Contact
          }]
        });
      });
      
      // Associations z line items (REQUIRED)
      createdLineItems.forEach(lineItem => {
        associations.push({
          to: { id: lineItem.id },
          types: [{
            associationCategory: 'HUBSPOT_DEFINED',
            associationTypeId: 67 // Quote to Line Item
          }]
        });
      });
      
      console.log('Creating quote with associations:', associations.length);
      
      // Utwórz quote z wszystkimi associations (API v3)
      const quote = await hubspotClient.crm.quotes.basicApi.create({
        properties: quoteProperties,
        associations: associations
      });
      
      console.log(`Created quote: ${quote.id}`);
      
      // Krok 7: Dodaj komentarz jako note
      try {
        const note = await hubspotClient.crm.objects.notes.basicApi.create({
          properties: {
            hs_note_body: quoteComment,
            hs_timestamp: Date.now()
          },
          associations: [
            {
              to: { id: quote.id },
              types: [{
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 202 // Note to Quote
              }]
            },
            {
              to: { id: dealId },
              types: [{
                associationCategory: 'HUBSPOT_DEFINED',
                associationTypeId: 214 // Note to Deal
              }]
            }
          ]
        });
        
        console.log(`Added note ${note.id} to quote ${quote.id} and deal ${dealId}`);
      } catch (noteError) {
        console.warn('Nie udało się dodać notatki:', noteError.message);
        console.error('Note error details:', noteError.body || noteError);
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
    return res.status(200).json({ 
      error: 'Failed to create quote', 
      detail: String(e?.message || e) 
    });
  }
}

export default withCORS(handler);
