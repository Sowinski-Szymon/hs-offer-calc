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
    // SOLO
    comment += `✅ pomoc techniczna przez chat i mail\n`;
    comment += `✅ wydłużone wsparcie pomiędzy 1 a 15 listopada do godziny 18:00\n`;
    comment += `✅ materiały szkoleniowe do samodzielnej nauki\n`;
    comment += `✅ dostęp do bazy wiedzy\n`;
    comment += `✅ regularne szkolenia grupowe\n`;
  } else if (tier === 'Tier2') {
    // PLUS
    comment += `Wszystko co w pakiecie SOLO oraz...\n`;
    comment += `✅ umawiane konsultacje telefoniczne - dla roli "Skarbnika"\n`;
    comment += `✅ pomoc przez chat i mail - dla pozostałych użytkowników\n`;
    comment += `✅ opiekun wdrożenia - indywidualnie dla w uruchomieniu platformy\n`;
  } else if (tier === 'Tier3') {
    // PRO
    comment += `Wszystko co w pakiecie PLUS oraz...\n`;
    comment += `✅ stała infolinia ekspercka - dla roli "Skarbnika"\n`;
    comment += `✅ umawiane konsultacje telefoniczne - dla wszystkich użytkowników w Urzędzie\n`;
    comment += `✅ gwarancja spokoju w najbardziej wymagających momentach roku - dyżury obsługi 11 listopada i 31 grudnia\n`;
  } else if (tier === 'Tier4') {
    // MAX
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
      
      // Krok 3: Generuj komentarz
      const quoteComment = generateQuoteComment(tier, lineItems);
      console.log('Generated quote comment:', quoteComment);
      
      // Krok 4: Utwórz quote
      const quoteProperties = {
        hs_title: quoteName || `Oferta - ${new Date().toISOString().slice(0, 10)}`,
        hs_expiration_date: expirationDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).getTime(),
        hs_status: 'DRAFT',
        hs_language: 'pl'
      };
      
      // Dodaj owner tylko jeśli jest dostępny
      if (dealOwnerId) {
        quoteProperties.hubspot_owner_id = String(dealOwnerId);
      }
      
      console.log('Quote properties:', quoteProperties);
      
      const quote = await hubspotClient.crm.quotes.basicApi.create({
        properties: quoteProperties
      });
      
      console.log(`Created quote: ${quote.id}`);
      
      // Krok 5: Powiąż quote z dealem
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
      
      // Krok 6: Powiąż line items z quote
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
      
      // Krok 7: Dodaj notatkę do quote z wygenerowanym komentarzem
      try {
        await hubspotClient.crm.objects.notes.basicApi.create({
          properties: {
            hs_note_body: quoteComment,
            hs_timestamp: Date.now()
          },
          associations: [
            {
              to: { id: quote.id },
              types: [
                {
                  associationCategory: 'HUBSPOT_DEFINED',
                  associationTypeId: 202 // Note to Quote
                }
              ]
            }
          ]
        });
        console.log(`Added note to quote ${quote.id}`);
      } catch (noteError) {
        console.warn('Nie udało się dodać notatki do quote:', noteError.message);
        // Nie przerywamy procesu jeśli notatka się nie uda
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
    return res.status(500).json({ 
      error: 'Failed to create quote', 
      detail: String(e?.message || e) 
    });
  }
}

export default withCORS(handler);
