// /api/company-overview.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

// mapowanie: którą datę pokazać dla jakiego produktu głównego
const NEXT_BILLING_PROPS = {
  WPF: 'wpf_next_billing_date',
  BUDZET: 'best_next_billing_date', // jeśli u Ciebie jest np. budzet_next_billing_date → podmień
  UMOWY: 'umowy_next_billing_date',
  SWB: 'swb_next_billing_date'
};

// normalizacja kluczy produktów głównych
function normKey(s = '') {
  return String(s).toUpperCase()
    .replace('EPUBLINK ', '')             // np. "EPUBLINK WPF" → "WPF"
    .replace('BUDŻET', 'BUDZET')
    .replace('Ł','L').replace('Ś','S').replace('Ó','O')
    .replace('Ż','Z').replace('Ź','Z').replace('Ć','C')
    .replace('Ę','E').replace('Ą','A').replace('Ń','N')
    .trim();
}

// z tokenu/etykiety zrób nasz klucz WPF/BUDZET/UMOWY/SWB
function toMainKey(tok = '') {
  const t = normKey(tok);
  if (t.includes('WPF')) return 'WPF';
  if (t.includes('UMOW')) return 'UMOWY';
  if (t.includes('SWB')) return 'SWB';
  if (t.includes('BUDZ')) return 'BUDZET';
  return t; // fallback – pokaż surowe, jeśli nie rozpoznaliśmy
}

// normalizacja Tiera (firma-level)
function normTier(t = '') {
  const x = String(t).trim().toUpperCase();
  if (!x) return null;
  if (['SOLO','S'].includes(x)) return 'Solo';
  if (['PLUS','PL'].includes(x)) return 'Plus';
  if (['PRO','PR'].includes(x)) return 'Pro';
  if (['MAX','M'].includes(x)) return 'Max';
  return t;
}

// parsowanie listy: akceptuj "," i ";" jako separatory
function parseList(val) {
  return String(val || '')
    .split(/[;,]/)
    .map(s => s.trim())
    .filter(Boolean);
}

module.exports = withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const properties = [
      'name',
      'aktywne_produkty_glowne',
      'aktywne_uslugi_dodatkowe',
      'subscription_tier', // tier na całej firmie
      'wpf_next_billing_date','swb_next_billing_date','best_next_billing_date','umowy_next_billing_date'
    ];
    const c = await hsFetch(`/crm/v3/objects/companies/${companyId}?properties=${encodeURIComponent(properties.join(','))}`);
    const p = c.properties || {};

    const ownedMain = [...new Set(parseList(p.aktywne_produkty_glowne).map(toMainKey))];
    const ownedServices = [...new Set(parseList(p.aktywne_uslugi_dodatkowe).map(normKey))];

    const companyTier = normTier(p.subscription_tier);

    const mainWithBilling = ownedMain.map(key => ({
      key,
      nextBillingDate: NEXT_BILLING_PROPS[key] ? (p[NEXT_BILLING_PROPS[key]] || null) : null,
      tier: companyTier || null
    }));

    return res.status(200).json({
      company: { id: c.id, name: p.name || '', tier: companyTier || null },
      owned: { main: mainWithBilling, services: ownedServices }
    });
  } catch (e) {
    return res.status(500).json({ error: 'company-overview failed', detail: String(e && e.message || e) });
  }
});
