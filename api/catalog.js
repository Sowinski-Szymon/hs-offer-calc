import { withCORS } from './_lib/cors.js';

const catalog = {
  currency: 'PLN',
  vatRate: 0.23,
  mainProducts: [
    { key: 'WPF', label: 'ePublink WPF', tiers: {
      Solo: { productId: 'PRODUCT_ID_WPF_SOLO' },
      Plus: { productId: 'PRODUCT_ID_WPF_PLUS' },
      Pro:  { productId: 'PRODUCT_ID_WPF_PRO'  },
      Max:  { productId: 'PRODUCT_ID_WPF_MAX'  }
    }},
    { key: 'BUDZET', label: 'ePublink Budżet', tiers: {
      Solo: { productId: 'PRODUCT_ID_BUDZET_SOLO' },
      Plus: { productId: 'PRODUCT_ID_BUDZET_PLUS' },
      Pro:  { productId: 'PRODUCT_ID_BUDZET_PRO'  },
      Max:  { productId: 'PRODUCT_ID_BUDZET_MAX'  }
    }},
    { key: 'UMOWY', label: 'ePublink Umowy', tiers: {
      Solo: { productId: 'PRODUCT_ID_UMOWY_SOLO' },
      Plus: { productId: 'PRODUCT_ID_UMOWY_PLUS' },
      Pro:  { productId: 'PRODUCT_ID_UMOWY_PRO'  },
      Max:  { productId: 'PRODUCT_ID_UMOWY_MAX'  }
    }},
    { key: 'SWB', label: 'ePublink SWB', tiers: {
      Solo: { productId: 'PRODUCT_ID_SWB_SOLO' },
      Plus: { productId: 'PRODUCT_ID_SWB_PLUS' },
      Pro:  { productId: 'PRODUCT_ID_SWB_PRO'  },
      Max:  { productId: 'PRODUCT_ID_SWB_MAX'  }
    }}
  ],
  services: [
    { key: 'OBS_WPF', label: 'Kompleksowa obsługa WPF', productId: 'PRODUCT_ID_OBS_WPF' },
    { key: 'DLUG', label: 'Wsparcie w zakresie obsługi długu', productId: 'PRODUCT_ID_DLUG' },
    { key: 'OBS_WPF_DLUG', label: 'Kompleksowa obsługa WPF wraz z obsługą długu', productId: 'PRODUCT_ID_OBS_WPF_DLUG' },
    { key: 'EXTRA_USER', label: 'Dodatkowy użytkownik do Tiera', productId: 'PRODUCT_ID_EXTRA_USER', qtySelectable: true }
  ]
};

export default withCORS(async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.status(200).json(catalog);
});
