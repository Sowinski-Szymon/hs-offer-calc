// /api/company-overview.js
import { withCORS } from './_lib/cors.js';
import { hsFetch } from './_lib/hs.js';

// Twarde mapowanie właściwości dat
const DATE_PROPS = {
  WPF:    'wpf_next_billing_date',
  BUDZET: 'best_next_billing_date',
  UMOWY:  'umowy_next_billing_date',
  SWB:    'swb_next_billing_date',
  PACK:   'pack_next_billing_date',
};

// Mapowanie typów licencji WPF na usługi
const WPF_LICENSE_TO_SERVICE = {
  'minimalna': null,
  'ekonomiczna': null,
  'premium': 'Kompleksowa obsługa WPF',
  'ekspert': 'Kompleksowa obsługa WPF wraz z rocznym wsparciem pozyskania finansowania',
  'standard': null,
  'zwrotne': 'Wsparcie w zakresie obsługi długu'
};

// Normalizacja nazw produktów z CRM -> klucze WPF/BUDZET/UMOWY/SWB
function normalizeProductName(input) {
  if (!input) return null;
  
  // Zdejmij diakrytyki i uppercase
  let s = String(input).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.toUpperCase().trim();
  
  // Usuń prefix "EPUBLINK" i znormalizuj białe znaki
  s = s.replace(/^EPUBLINK\s*/gi, '').replace(/\s+/g, ' ').trim();
  
  // Bezpośrednie dopasowanie po treści (po usunięciu ePublink)
  if (s === 'WPF') return 'WPF';
  if (s === 'SWB') return 'SWB';
  if (s === 'UMOWY') return 'UMOWY';
  if (s === 'BUDZET' || s === 'BEST') return 'BUDZET';
  
  // Fallback: szukaj w całym stringu (dla przypadków z dodatkowymi słowami)
  if (/\bWPF\b/.test(s)) return 'WPF';
  if (/\bSWB\b/.test(s)) return 'SWB';
  if (/\bUMOWY?\b/.test(s)) return 'UMOWY';
  if (/\bBUDZET\b/.test(s) || /\bBEST\b/.test(s)) return 'BUDZET';
  
  console.warn(`Nierozpoznany produkt: "${input}" -> normalizacja: "${s}"`);
  return null;
}

// pomocnik: wyciągnij pierwszą niepustą wartość z listy property
function pick(obj, prop) {
  const v = obj?.[prop];
  return (v !== undefined && v !== null && v !== '') ? v : null;
}

export default withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });
    
    // Pobierz wszystkie potrzebne właściwości za 1 razem
    const props = [
      'name',
      'domain',
      'subscription_tier',
      'pack_next_billing_date',
      'aktywne_produkty_glowne',
      'aktywne_uslugi_dodatkowe',
      'wpf_typ_licencji',
      ...Object.values(DATE_PROPS)
    ];
    
    const comp = await hsFetch(`/crm/v3/objects/companies/${companyId}?properties=${encodeURIComponent(props.join(','))}`);
    const p = comp?.properties || {};
    
    // rozbij CSV i normalizuj białe znaki
    const splitCsv = (val) => String(val || '')
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(Boolean);
    
    // Znormalizuj posiadane produkty główne
    const ownedMainKeys = [
      ...new Set(
        splitCsv(p.aktywne_produkty_glowne)
          .map(normalizeProductName)
          .filter(key => key && ['WPF', 'BUDZET', 'UMOWY', 'SWB'].includes(key))
      )
    ];
    
    // Wykryj usługi z wpf_typ_licencji
    const wpfLicenseType = String(p.wpf_typ_licencji || '').toLowerCase().trim();
    const serviceFromWpfLicense = WPF_LICENSE_TO_SERVICE[wpfLicenseType];
    
    // Zbierz usługi z aktywne_uslugi_dodatkowe + z wpf_typ_licencji
    const servicesFromProperty = splitCsv(p.aktywne_uslugi_dodatkowe);
    const allServices = [...new Set([
      ...servicesFromProperty,
      ...(serviceFromWpfLicense ? [serviceFromWpfLicense] : [])
    ])].filter(Boolean);
    
    // Zbuduj listę "owned.main" z datami z właściwości firmy
    const mainWithBilling = ownedMainKeys.map(key => ({
      key,
      nextBillingDate: pick(p, DATE_PROPS[key])
    }));
    
    const packNext = pick(p, DATE_PROPS.PACK);
    
    return res.status(200).json({
      company: {
        id: comp.id,
        properties: {
          name: p.name || '',
          domain: p.domain || '',
          subscription_tier: p.subscription_tier || null,
          pack_next_billing_date: packNext,
          wpf_typ_licencji: p.wpf_typ_licencji || null
        }
      },
      owned: {
        main: mainWithBilling,
        services: allServices
      }
    });
  } catch (e) {
    console.error('company-overview error:', e);
    return res.status(500).json({ 
      error: 'company-overview failed', 
      detail: String(e?.message || e) 
    });
  }
});
