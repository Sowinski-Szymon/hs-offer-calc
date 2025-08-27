import { Client } from '@hubspot/api-client';

export default async function handler(req, res) {
  // --- KOREKTA (CORS): Ustawienie nagłówków dla wszystkich odpowiedzi ---
  // Pozwala na zapytania z dowolnej domeny. W produkcji warto to ograniczyć.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Obsługa zapytania wstępnego CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { companyId } = req.query;
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    const pipelineId = process.env.PIPELINE_ID;

    if (!companyId) {
      return res.status(400).json({ error: 'Query parameter "companyId" is required.' });
    }
    if (!accessToken || !pipelineId) {
      console.error('Błąd konfiguracji: Brak zmiennych środowiskowych HubSpot.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    // --- KOREKTA (Import): Użycie "new Client" zamiast "new hubspot.Client" ---
    const hubspotClient = new Client({ accessToken });

    // --- LOGIKA (Search API): Pozostaje bez zmian, bo jest poprawna i wydajna ---
    const searchResult = await hubspotClient.crm.deals.searchApi.doSearch({
      filterGroups: [{
        filters: [
          { propertyName: 'associations.company', operator: 'EQ', value: companyId },
          { propertyName: 'pipeline', operator: 'EQ', value: pipelineId }
        ]
      }],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      properties: ['dealname', 'pipeline', 'hubspot_owner_id'],
      limit: 1
    });

    const foundDeal = searchResult.results?.[0];

    if (!foundDeal) {
      return res.status(200).json({ deal: null });
    }

    let ownerDetails = null;
    const ownerId = foundDeal.properties.hubspot_owner_id;
    if (ownerId) {
      try {
        const ownerData = await hubspotClient.crm.owners.ownersApi.getById(ownerId);
        // --- KOREKTA (Bezpieczeństwo): Sprawdzenie, czy obiekt ownerData istnieje ---
        if (ownerData) {
          ownerDetails = {
            id: ownerData.id,
            name: `${ownerData.firstName} ${ownerData.lastName}`,
            email: ownerData.email
          };
        }
      } catch (ownerError) {
        console.warn(`Nie udało się pobrać właściciela o ID ${ownerId}.`);
        ownerDetails = { id: ownerId, name: 'Dane niedostępne', email: null };
      }
    }

    return res.status(200).json({
      deal: {
        id: foundDeal.id,
        name: foundDeal.properties.dealname || '',
        pipelineId: foundDeal.properties.pipeline || null,
        owner: ownerDetails
      }
    });

  } catch (e) {
    console.error('--- Błąd krytyczny w funkcji API ---', e.body || e.message);
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}
