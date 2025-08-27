// /api/deal-by-company.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

// Stałe, które teraz faktycznie będą używane
const PIPELINE_ID = '1978057944'; // ID potoku, po którym filtrujemy

module.exports = withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    // 1) Zbuduj zapytanie wyszukiwania, które od razu filtruje i pobiera co trzeba
    const searchPayload = {
      // Filtrujemy jednocześnie po dwóch warunkach (łącznik AND)
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'associations.company',
              operator: 'EQ',
              value: companyId
            },
            {
              propertyName: 'pipeline',
              operator: 'EQ',
              value: PIPELINE_ID
            }
          ]
        }
      ],
      // Sortujemy, aby mieć pewność, że zawsze dostaniemy ten sam wynik (np. najnowszy)
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      // Od razu pobieramy potrzebne właściwości
      properties: ['dealname', 'pipeline', 'hubspot_owner_id'],
      // Potrzebujemy tylko JEDNEGO wyniku
      limit: 1
    };

    // 2) Wykonaj JEDNO zapytanie do API HubSpot
    const searchResult = await hsFetch('/crm/v3/objects/deals/search', {
      method: 'POST',
      body: JSON.stringify(searchPayload)
    });

    const foundDeal = searchResult?.results?.[0];

    // Jeśli wyszukiwanie nie zwróciło żadnego deala, kończymy
    if (!foundDeal) {
      return res.status(200).json({ deal: null });
    }

    // 3) Pobierz dane właściciela (ta część pozostaje bez zmian)
    let owner = null;
    const ownerId = foundDeal.properties.hubspot_owner_id;
    if (ownerId) {
      try {
        const ownerData = await hsFetch(`/crm/v3/owners/${encodeURIComponent(ownerId)}`);
        owner = {
          id: ownerData.id,
          name: `${ownerData.firstName} ${ownerData.lastName}`,
          email: ownerData.email
        };
      } catch (e) {
        // Zabezpieczenie, gdyby właściciel nie istniał
        owner = { id: ownerId, name: 'Nieznany właściciel', email: null };
      }
    }

    // 4) Zwróć znaleziony deal
    return res.status(200).json({
      deal: {
        id: foundDeal.id,
        name: foundDeal.properties.dealname || '',
        pipelineId: foundDeal.properties.pipeline || null,
        owner
      }
    });

  } catch (e) {
    res.status(500).json({ error: 'deal-by-company failed', detail: String(e?.message || e) });
  }
});
