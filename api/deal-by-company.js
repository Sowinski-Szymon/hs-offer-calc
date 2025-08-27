// Krok 1: Importuj niezbędne biblioteki i swój wrapper CORS
import { withCORS } from '../_lib/cors.js';
import { Client } from '@hubspot/api-client';

/**
 * Główna logika API: znajduje deal powiązany z firmą i w określonym pipeline.
 * Ta funkcja jest "czysta" - nie zajmuje się bezpośrednio CORS, bo robi to wrapper.
 * @param {import('next').NextApiRequest} req - Obiekt zapytania
 * @param {import('next').NextApiResponse} res - Obiekt odpowiedzi
 */
async function handler(req, res) {
  try {
    // --- Pobranie danych i walidacja ---
    const { companyId } = req.query;
    const accessToken = process.env.HUBSPOT_ACCESS_TOKEN;
    const pipelineId = process.env.PIPELINE_ID;

    if (!companyId) {
      return res.status(400).json({ error: 'Query parameter "companyId" is required.' });
    }
    if (!accessToken || !pipelineId) {
      console.error('Błąd konfiguracji serwera: Brak zmiennych środowiskowych HubSpot (HUBSPOT_ACCESS_TOKEN lub PIPELINE_ID).');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    // --- Logika biznesowa ---
    const hubspotClient = new Client({ accessToken });

    // Użyj wydajnego Search API do znalezienia deala w jednym zapytaniu
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

    // Jeśli nie znaleziono deala, zwróć poprawną, pustą odpowiedź
    if (!foundDeal) {
      return res.status(200).json({ deal: null });
    }

    // Pobierz dane właściciela (jeśli istnieje)
    let ownerDetails = null;
    const ownerId = foundDeal.properties.hubspot_owner_id;
    if (ownerId) {
      try {
        const ownerData = await hubspotClient.crm.owners.ownersApi.getById(ownerId);
        if (ownerData) {
          ownerDetails = {
            id: ownerData.id,
            name: `${ownerData.firstName || ''} ${ownerData.lastName || ''}`.trim(),
            email: ownerData.email
          };
        }
      } catch (ownerError) {
        console.warn(`Nie udało się pobrać właściciela o ID ${ownerId}. Błąd: ${ownerError.message}`);
        ownerDetails = { id: ownerId, name: 'Dane właściciela niedostępne', email: null };
      }
    }

    // --- Zwróć pomyślną odpowiedź ---
    return res.status(200).json({
      deal: {
        id: foundDeal.id,
        name: foundDeal.properties.dealname || '',
        pipelineId: foundDeal.properties.pipeline || null,
        owner: ownerDetails
      }
    });

  } catch (e) {
    // Złap jakikolwiek błąd z logiki powyżej
    const errorMessage = e.body ? JSON.stringify(e.body) : e.message;
    console.error('--- KRYTYCZNY BŁĄD w handlerze deal-by-company ---', errorMessage);
    
    // Zwróć generyczny błąd na frontend
    return res.status(500).json({ error: 'An internal server error occurred while processing the request.' });
  }
}

// Krok 2: Wyeksportuj swój handler owinięty w logikę CORS
export default withCORS(handler);
