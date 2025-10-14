// /api/company-billing.js
import { withCORS } from './_lib/cors.js';
import { hsFetch } from './_lib/hs.js';

export default withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ error: 'companyId required' });
  
  const COMPANY_PROPS = [
    'pakiet',
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
    lastNet: {},
    rawProperties: { // NOWE: zwracamy też surowe property dla formularza
      pakiet: p.pakiet || '',
      wpf_ostatnia_faktura: p.wpf_ostatnia_faktura || '',
      swb_ostatnia_faktura: p.swb_ostatnia_faktura || '',
      budzet_ostatnia_faktura: p.budzet_ostatnia_faktura || '',
      umowy_ostatnia_faktura: p.umowy_ostatnia_faktura || '',
      pakiet_ostatnia_faktura: p.pakiet_ostatnia_faktura || ''
    }
  };
  
  if (isPackageOnCompany) {
    payload.lastNet.package = num(p.pakiet_ostatnia_faktura);
  } else {
    payload.lastNet = {
      WPF: num(p.wpf_ostatnia_faktura),
      SWB: num(p.swb_ostatnia_faktura),
      BUDZET: num(p.budzet_ostatnia_faktura),
      UMOWY: num(p.umowy_ostatnia_faktura)
    };
  }
  
  return res.status(200).json(payload);
});
