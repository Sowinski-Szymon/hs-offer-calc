// /api/company-overview.js

// ZMIANA: Użycie 'import' zamiast 'require' i dodanie rozszerzenia .js
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

// Normalizacja nazw produktów z CRM -> klucze WPF/BUDZET/UMOWY/SWB
function normalizeProductName(input) {
  if (!input) return null;
  // zdejmij diakrytyki
  let s = String(input).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.toUpperCase().trim();

  // usuń prefixy/śmieci typu "EPUBLINK", kropki, podwójne spacje
  s = s.replace(/^EPUBLINK\s+/g, '').replace(/\s+/g, ' ');

  // mądre dopasowanie po słowach-kluczach
  if (/\bWPF\b/.test(s)) return 'WPF';
  if (/\bUMOWY?\b/.test(s)) return 'UMOWY';
  if (/\bSWB\b/.test(s)) return 'SWB';
  if (/\bBUDZET\b/.test(s)) return 'BUDZET';

  return s;
}

// pomocnik: wyciągnij pierwszą niepustą wartość z listy property
function pick(obj, prop) {
  const v = obj?.[prop];
  return (v !== undefined && v !== null && v !== '') ? v : null;
}

// ZMIANA: Użycie 'export default' zamiast 'module.exports'
export default withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    // Pobierz wszystkie potrzebne właściwości za 1 razem
    const props = [
      'name',
      'subscription_tier',
      'aktywne_produkty_glowne',
      'aktywne_uslugi_dodatkowe',
      ...Object.values(DATE_PROPS) // Uproszczone dodawanie wszystkich dat
    ];

    const comp = await hsFetch(`/crm/v3/objects/companies/${companyId}?properties=${encodeURIComponent(props.join(','))}`);
    const p = comp?.properties || {};

    // rozbij CSV
    const splitCsv = (val) => String(val || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    // Znormalizuj posiadane produkty główne
    const ownedMainKeys = [
      ...new Set(
        splitCsv(p.aktywne_produkty_glowne)
          .map(normalizeProductName)
          .filter(key => Object.keys(DATE_PROPS).includes(key)) // Upewnij się, że klucz jest poprawny
      )
    ];

    // Znormalizuj usługi
    const ownedServices = [
      ...new Set(splitCsv(p.aktywne_uslugi_dodatkowe))
    ];

    // Zbuduj listę "owned.main" z datami z właściwości firmy
    const mainWithBilling = ownedMainKeys.map(key => ({
      key,
      nextBillingDate: pick(p, DATE_PROPS[key])
    }));

    const packNext = pick(p, DATE_PROPS.PACK);

    return res.status(200).json({
      company: {
        id: comp.id,
        name: p.name || '',
        tier: p.subscription_tier || null,
        packNextBillingDate: packNext
      },
      owned: {
        main: mainWithBilling,
        services: ownedServices
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'company-overview failed', detail: String(e?.message || e) });
  }
});
