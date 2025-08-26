// /api/company-overview.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

// Pipeline, z którego bierzemy (najnowszy) deal skojarzony z firmą
const PIPELINE_ID = '1978057944';

// mapowanie: właściwości z datą nast. rozliczenia per produkt główny
const NEXT_BILLING_PROPS = {
  WPF: 'wpf_next_billing_date',
  BUDZET: 'best_next_billing_date',
  UMOWY: 'umowy_next_billing_date',
  SWB: 'swb_next_billing_date'
};

module.exports = withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const companyId = req.query.companyId;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    // Właściwości Company, których potrzebujemy
    const properties = [
      'name',
      'aktywne_produkty_glowne',
      'aktywne_uslugi_dodatkowe',
      'wpf_next_billing_date',
      'swb_next_billing_date',
      'best_next_billing_date',
      'umowy_next_billing_date',
      'pakiet',                 // checkbox: czy firma ma pakiet
      'pack_next_billing_date', // zbiorcza data końca pakietu
      'subscription_tier'       // (opcjonalnie, jeśli przechowujecie ładne nazwy typu Solo/Plus/Pro/Max)
    ];

    // 1) Firma
    const c = await hsFetch(
      `/crm/v3/objects/companies/${companyId}?properties=${encodeURIComponent(properties.join(','))}`
    );
    const p = c?.properties || {};

    // helpery
    const parseCsv = (val) =>
      String(val || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const norm = (s) =>
      s
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

    const ownedMain = [...new Set(parseCsv(p.aktywne_produkty_glowne).map(norm))];
    const ownedServices = [...new Set(parseCsv(p.aktywne_uslugi_dodatkowe).map(norm))];

    const mainWithBilling = ownedMain.map((key) => {
      const prop = NEXT_BILLING_PROPS[key];
      return { key, nextBillingDate: prop ? p[prop] || null : null };
    });

    // 2) (Dodatkowo) Najnowszy deal z tego pipeline'u, skojarzony z firmą
    //    Używamy search po dealach z filtrem assoc. company i pipeline = PIPELINE_ID
    let dealSummary = null;
    try {
      const searchBody = {
        filterGroups: [
          {
            filters: [
              {
                propertyName: 'associations.company',
                operator: 'EQ',
                value: String(companyId)
              },
              {
                propertyName: 'pipeline',
                operator: 'EQ',
                value: PIPELINE_ID
              }
            ]
          }
        ],
        sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
        limit: 1,
        properties: ['dealname', 'pipeline', 'dealstage', 'hubspot_owner_id']
      };

      const sr = await hsFetch(`/crm/v3/objects/deals/search`, {
        method: 'POST',
        body: JSON.stringify(searchBody)
      });

      const d = Array.isArray(sr?.results) && sr.results.length ? sr.results[0] : null;
      if (d) {
        dealSummary = {
          id: d.id,
          name: d.properties?.dealname || '',
          pipeline: d.properties?.pipeline || '',
          stage: d.properties?.dealstage || '',
          ownerId: d.properties?.hubspot_owner_id || null
        };
      }
    } catch (e) {
      // Nie blokujemy całej odpowiedzi, jeśli wyszukiwanie deala się nie powiedzie
      // dealSummary pozostanie null
    }

    // 3) Odpowiedź
    return res.status(200).json({
      company: {
        id: c.id,
        name: p.name || '',
        tier: p.subscription_tier || null,
        isPackageOnCompany: String(p.pakiet || '').toLowerCase() === 'true',
        packNextBillingDate: p.pack_next_billing_date || null
      },
      owned: {
        main: mainWithBilling,
        services: ownedServices
      },
      deal: dealSummary // może być null, jeśli brak deal'a w pipeline 1978057944
    });
  } catch (e) {
    return res.status(500).json({ error: 'company-overview failed', detail: String(e && e.message || e) });
  }
});
