// /api/company-overview.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

// mapowanie: którą datę pokazać dla jakiego produktu głównego
const NEXT_BILLING_PROPS = {
  WPF: 'wpf_next_billing_date',
  BUDZET: 'best_next_billing_date',    // jeśli masz inną nazwę (np. budzet_next_billing_date) – podmień tutaj
  UMOWY: 'umowy_next_billing_date',
  SWB: 'swb_next_billing_date'
};

module.exports = withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const companyId = req.query.companyId;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });

  // Pobierz firmę z interesującymi nas polami
  const properties = [
    'name',
    'aktywne_produkty_glowne',
    'aktywne_uslugi_dodatkowe',
    'wpf_next_billing_date',
    'swb_next_billing_date',
    'best_next_billing_date',
    'umowy_next_billing_date'
  ];

  const c = await hsFetch(`/crm/v3/objects/companies/${companyId}?properties=${encodeURIComponent(properties.join(','))}`);
  const p = c.properties || {};

  // parsowanie CSV z właściwości (np. "WPF, BUDZET")
  const parseCsv = (val) =>
    (String(val || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean));

  const ownedMainRaw = parseCsv(p.aktywne_produkty_glowne);
  const ownedServicesRaw = parseCsv(p.aktywne_uslugi_dodatkowe);

  // Normalizuj klucze na UPPERCASE bez polskich znaków (żeby spiąć z frontem)
  const norm = (s) => s
    .toUpperCase()
    .replace('BUDŻET', 'BUDZET')
    .replace('Ł', 'L')
    .replace('Ś', 'S')
    .replace('Ó', 'O')
    .replace('Ż', 'Z')
    .replace('Ź', 'Z')
    .replace('Ć', 'C')
    .replace('Ę', 'E')
    .replace('Ą', 'A')
    .replace('Ń', 'N');

  const ownedMain = [...new Set(ownedMainRaw.map(norm))];       // np. ["WPF","BUDZET","UMOWY"]
  const ownedServices = [...new Set(ownedServicesRaw.map(norm))];

  // zbuduj obiekty z datami
  const mainWithBilling = ownedMain.map(key => {
    const dateProp = NEXT_BILLING_PROPS[key];
    let dateVal = dateProp ? p[dateProp] : null; // HS zwykle zwraca ISO lub timestamp (ms). Zostawiamy jak jest.
    return { key, nextBillingDate: dateVal || null };
  });

  res.status(200).json({
    company: { id: c.id, name: p.name || '' },
    owned: {
      main: mainWithBilling,       // [{ key: "WPF", nextBillingDate: "2025-12-01" }, ...]
      services: ownedServices      // ["OBS_WPF", "DLUG", ...] – jeżeli takie klucze wpisujesz w HS
    }
  });
});
