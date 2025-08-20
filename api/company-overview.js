// /api/company-overview.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

// mapowanie: którą datę pokazać dla jakiego produktu głównego
const NEXT_BILLING_PROPS = {
  WPF: 'wpf_next_billing_date',
  BUDZET: 'best_next_billing_date', // jeśli u Ciebie jest np. budzet_next_billing_date → podmień tutaj
  UMOWY: 'umowy_next_billing_date',
  SWB: 'swb_next_billing_date'
};

// normalizacja kluczy produktów głównych
function normKey(s = '') {
  return String(s).toUpperCase()
    .replace('BUDŻET', 'BUDZET')
    .replace('Ł','L').replace('Ś','S').replace('Ó','O')
    .replace('Ż','Z').replace('Ź','Z').replace('Ć','C')
    .replace('Ę','E').replace('Ą','A').replace('Ń','N')
    .trim();
}

// normalizacja nazwy tier
function normTier(t = '') {
  const x = String(t).trim().toUpperCase();
  if (!x) return null;
  if (['SOLO','S'].includes(x)) return 'Solo';
  if (['PLUS','PL'].includes(x)) return 'Plus';
  if (['PRO','PR'].includes(x)) return 'Pro';
  if (['MAX','M'].includes(x)) return 'Max';
  return t; // zostaw surowe, jeśli inny wariant
}

// parsowanie CSV (np. "WPF, BUDZET")
function parseCsv(val) {
  return String(val || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

// parsowanie subscription_tier z róznych formatów:
// 1) JSON: {"WPF":"Plus","BUDZET":"Pro"}
// 2) "WPF:Plus; BUDZET:Pro; SWB:Solo"
// 3) "WPF,Plus;BUDZET,Pro"
function parseTierMap(raw) {
  const out = {};
  if (!raw) return out;
  const str = String(raw).trim();
  // JSON
  if (str.startsWith('{')) {
    try {
      const obj = JSON.parse(str);
      for (const [k,v] of Object.entries(obj)) out[normKey(k)] = normTier(v);
      return out;
    } catch {}
  }
  // rozdzielone średnikami
  const parts = str.split(';').map(s => s.trim()).filter(Boolean);
  parts.forEach(p => {
    // KEY:TIER
    if (p.includes(':')) {
      const [k,v] = p.split(':');
      out[normKey(k)] = normTier(v);
      return;
    }
    // KEY,TIER
    if (p.includes(',')) {
      const [k,v] = p.split(',');
      out[normKey(k)] = normTier(v);
      return;
    }
  });
  return out;
}

module.exports = withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    // pobierz firmę z potrzebnymi polami
    const properties = [
      'name',
      'aktywne_produkty_glowne',
      'aktywne_uslugi_dodatkowe',
      'subscription_tier', // <-- TUTAJ czytamy tier
      'wpf_next_billing_date',
      'swb_next_billing_date',
      'best_next_billing_date',
      'umowy_next_billing_date'
    ];
    const c = await hsFetch(`/crm/v3/objects/companies/${companyId}?properties=${encodeURIComponent(properties.join(','))}`);
    const p = c.properties || {};

    const ownedMainRaw = parseCsv(p.aktywne_produkty_glowne);
    const ownedServicesRaw = parseCsv(p.aktywne_uslugi_dodatkowe);
    const ownedMain = [...new Set(ownedMainRaw.map(normKey))];
    const ownedServices = [...new Set(ownedServicesRaw.map(normKey))];

    // map tierów
    const tierMap = parseTierMap(p.subscription_tier);

    // zbuduj obiekty z datami i tierem (daty: ISO lub ms → front to sformatuje)
    const mainWithBilling = ownedMain.map(key => {
      const dateProp = NEXT_BILLING_PROPS[key];
      const nextBillingDate = dateProp ? (p[dateProp] || null) : null;
      const tier = tierMap[key] || null;
      return { key, nextBillingDate, tier };
    });

    return res.status(200).json({
      company: { id: c.id, name: p.name || '' },
      owned: {
        main: mainWithBilling, // [{ key, nextBillingDate, tier }]
        services: ownedServices
      }
    });
  } catch (e) {
    // zawsze jasny JSON zamiast "nagiego" 500
    return res.status(500).json({ error: 'company-overview failed', detail: String(e && e.message || e) });
  }
});
