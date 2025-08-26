// /api/company-overview.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

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
  if (/\bBUDZET\b/.test(s) || /\bBUDZET\b/.test(s)) return 'BUDZET'; // po diakrytykach i tak mamy BUDZET

  // czasami ktoś wpisze "EPUBLINK SWB" – powyższe to już pokrywa;
  // jeśli jednak wpadnie coś egzotycznego, zwróć surowe (dla debug)
  return s;
}

// pomocnik: wyciągnij pierwszą niepustą wartość z listy property
function pick(obj, prop) {
  const v = obj?.[prop];
  return (v !== undefined && v !== null && v !== '') ? v : null;
}

module.exports = withCORS(async (req, res) => {
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
      DATE_PROPS.WPF,
      DATE_PROPS.BUDZET,
      DATE_PROPS.UMOWY,
      DATE_PROPS.SWB,
      DATE_PROPS.PACK
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
          .filter(Boolean)
      )
    ];

    // Znormalizuj usługi (zostawiam surowe, ale równie dobrze możesz tu też normalizować pod własny klucz)
    const ownedServices = [
      ...new Set(splitCsv(p.aktywne_uslugi_dodatkowe))
    ];

    // Zbuduj listę "owned.main" z datami z właściwości firmy
    const mainWithBilling = ownedMainKeys.map(key => {
      let nextBillingDate = null;
      if (key === 'WPF')    nextBillingDate = pick(p, DATE_PROPS.WPF);
      if (key === 'BUDZET') nextBillingDate = pick(p, DATE_PROPS.BUDZET);
      if (key === 'UMOWY')  nextBillingDate = pick(p, DATE_PROPS.UMOWY);
      if (key === 'SWB')    nextBillingDate = pick(p, DATE_PROPS.SWB);
      return { key, nextBillingDate };
    });

    // Company-level: tier i data pakietu
    const packNext = pick(p, DATE_PROPS.PACK);

    return res.status(200).json({
      company: {
        id: comp.id,
        name: p.name || '',
        tier: p.subscription_tier || null,
        isPackageOnCompany: false, // jeżeli masz checkbox "pakiet" na company i chcesz go tu zwracać – dodaj go tu
        packNextBillingDate: packNext
      },
      owned: {
        main: mainWithBilling,   // <- KLUCZE JUŻ SĄ WPF/BUDZET/UMOWY/SWB, daty podbite z właściwości
        services: ownedServices
      },
      deal: null // (jeśli miałeś, usuń – deal robisz osobnym endpointem)
    });
  } catch (e) {
    return res.status(500).json({ error: 'company-overview failed', detail: String(e && e.message || e) });
  }
});
