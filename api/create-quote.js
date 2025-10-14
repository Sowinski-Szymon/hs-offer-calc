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
  const hasWPF = productNames.some(p => p.includes('WPF'));
  const hasBudget = productNames.some(p => p.includes('Budżet'));
  const hasSWB = productNames.some(p => p.includes('SWB'));
  const hasUmowy = productNames.some(p => p.includes('Umowy'));
  
  // Lista modułów
  const modules = [];
  if (hasWPF) modules.push('ePublink WPF');
  if (hasBudget) modules.push('Budżet');
  if (hasSWB) modules.push('SWB');
  if (hasUmowy) modules.push('Umowy');
  
  const modulesText = modules.length > 0 ? modules.join(', ') : 'wybrane moduły';
  
  // Dodatkowi użytkownicy
  const extraUsers = lineItems.find(li => li.name && li.name.includes('Dodatkowy użytkownik'));
  const extraUsersQty = extraUsers ? extraUsers.quantity : 0;
  
  // Generuj komentarz w stylu tego ze screenshota
  let comment = `Wybierając tę ofertę, otrzymują Państwo:\n\n`;
  
  // Dostęp do modułów
  comment += `• dostęp do modułów ${modulesText} w ramach planu ${tierName.toUpperCase()}`;
  if (tier === 'Tier2') {
    comment += ` (szczegóły na www.publink.com/cennik)`;
  }
  comment += `\n`;
  
  // Konsultacje telefoniczne
  if (tier === 'Tier2' || tier === 'Tier3' || tier === 'Tier4') {
    comment += `• konsultacje telefoniczne dla roli Skarbnik\n`;
  }
  
  // Opiekun wdrożenia
  if (tier === 'Tier3' || tier === 'Tier4') {
    comment += `• opiekun wdrożenia\n`;
  }
  
  // Dyżury zespołu
  if (tier === 'Tier2') {
    comment += `• dodatkowe dyżury zespołu Publink 11 listopada i 31 grudnia\n`;
  } else if (tier === 'Tier3' || tier === 'Tier4') {
    comment += `• dodatkowe dyżury zespołu Publink przez cały rok\n`;
  }
  
  // Pomoc przez chat i mail
  comment += `• pomoc przez chat i mail dla pozostałych użytkowników\n`;
  
  // Szkolenia grupowe
  if (tier === 'Tier2' || tier === 'Tier3' || tier === 'Tier4') {
    comment += `• regularne szkolenia grupowe\n`;
  }
  
  // Dostęp do bazy wiedzy
  comment += `• dostęp do bazy wiedzy\n`;
  
  // Liczba użytkowników
  let userCount = 10;
  if (tier === 'Tier2') userCount = 20;
  if (tier === 'Tier3') userCount = 50;
  if (tier === 'Tier4') userCount = 'nieograniczona liczba';
  
  if (tier === 'Tier4') {
    comment += `• nieograniczona liczba użytkowników w urzędzie i JO\n`;
  } else {
    comment += `• wliczeni do ${userCount} użytkownika w urzędzie i do ${userCount} w JO\n`;
  }
  
  // Koszt dodatkowych użytkowników
  if (tier !== 'Tier4') {
    const extraUserPrice = extraUsers ? extraUsers.price : 690; // domyślna cena dla Plus
    comment += `• każdy kolejny użytkownik ${extraUserPrice} zł rocznie (netto)`;
    if (extraUsersQty > 0) {
      comment += ` - w ofercie: ${extraUsersQty} dodatkowych użytkowników`;
    }
    comment += `\n`;
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
      return res
