// /api/company-billing

// ZMIANA: Użycie 'import' zamiast 'require' i dodanie rozszerzenia .js
import { withCORS } from './_lib/cors.js';
import { hsFetch } from './_lib/hs.js';

/**
 * Zwraca dane do kompensaty:
 * - isPackageOnCompany: boolean (company.properties.pakiet)
 * - lastNet: { WPF, BUDZET, UMOWY, SWB } lub { package }
 */
// ZMIANA: Użycie 'export default' zamiast 'module.exports'
export default withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });

  // Internal names wg Twojej specyfikacji
  const COMPANY_PROPS = [
    'pakiet',                 // checkbox
    'wpf_ostatnia_faktura',
    'swb_ostatnia_faktura',
    'budzet_ostatnia_faktura',
    'umowy_ostatnia_faktura',
    'pakiet_ostatnia_faktura'
  ];

  const c = await hsFetch(`/crm/v3/objects/companies/${companyId}?properties=${encodeURIComponent(COMPANY_PROPS.join(','))}`);
  const p = c?.properties || {};

  const isPackageOnCompany = String(p.pakiet || '').toLowerCase() === 'true';
  const num = (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  const payload = {
    isPackageOnCompany,
    lastNet: {}
  };

  if (isPackageOnCompany) {
    payload.lastNet.package = num(p.pakiet_ostatnia_faktura);
  } else {
    payload.lastNet = {
      WPF:    num(p.wpf_ostatnia_faktura),
      SWB:    num(p.swb_ostatnia_faktura),
      BUDZET: num(p.budzet_ostatnia_faktura),
      UMOWY:  num(p.umowy_ostatnia_faktura)
    };
  }

  return res.status(200).json(payload);
});
