// /api/catalog.js
const { withCORS } = require('./_lib/cors');

/**
 * Prosty katalog: 1 produkt = 1 productId w HS.
 * Etykiety odpowiadają tym z Twojego PRODUCT_IDS.
 */
const CATALOG = {
  mainProducts: [
    { key: 'WPF',    label: 'ePublink WPF',    productId: '156989205705' },
    { key: 'BUDZET', label: 'ePublink Budżet', productId: '157907854571' },
    { key: 'UMOWY',  label: 'ePublink Umowy',  productId: '156989205704' },
    { key: 'SWB',    label: 'ePublink SWB',    productId: '156989205706' }
  ],
  services: [
    { key: 'OBS_WPF',     label: 'Kompleksowa obsługa WPF', productId: '157907854575' },
    { key: 'DLUG',        label: 'Wsparcie w zakresie obsługi długu', productId: '156989205708' },
    { key: 'OBS_WPF_FIN', label: 'Kompleksowa obsługa WPF wraz z rocznym wsparciem pozyskania finansowania', productId: '163991043317' }
  ]
};

module.exports = withCORS(async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  return res.status(200).json(CATALOG);
});
