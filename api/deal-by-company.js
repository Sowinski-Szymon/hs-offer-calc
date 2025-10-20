// /api/deal-by-company.js
import { withCORS } from './_lib/cors.js';
import { Client } from '@hubspot/api-client';

async function handler(req, res) {
  try {
    const { companyId } = req.query;
    
    const accessToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    const pipelineId = process.env.PIPELINE_ID;
    
    if (!companyId) {
      return res.status(400).json({ error: 'Query parameter "companyId" is required.' });
    }
    if (!accessToken || !pipelineId) {
      console.error('Błąd konfiguracji serwera: Brak HUBSPOT_PRIVATE_APP_TOKEN lub PIPELINE_ID.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }
    
    const hubspotClient = new Client({ accessToken });
    
    const searchResult = await hubspotClient.crm.deals.searchApi.doSearch({
      filterGroups: [{
        filters: [
          { propertyName: 'associations.company', operator: 'EQ', value: companyId },
          { propertyName: 'pipeline', operator: 'EQ', value: pipelineId }
        ]
      }],
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      properties: ['dealname', 'pipeline', 'hubspot_owner_id', 'closedate', 'subscription_tier', 'dealstage', 'rabat__pakiet_', 'rabat__uznanie_'],
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
    
    return res.status(200).json({
      deal: {
        id: foundDeal.id,
        name: foundDeal.properties.dealname || '',
        pipelineId: foundDeal.properties.pipeline || null,
        owner: ownerDetails,
        properties: {
          closedate: foundDeal.properties.closedate || null,
          subscription_tier: foundDeal.properties.subscription_tier || null,
          dealstage: foundDeal.properties.dealstage || null,
          rabat__pakiet_: foundDeal.properties.rabat__pakiet_ || null,
          rabat__uznanie_: foundDeal.properties.rabat__uznanie_ || null
         }
      }
    });
  } catch (e) {
    const errorMessage = e.body ? JSON.stringify(e.body) : e.message;
    console.error('--- KRYTYCZNY BŁĄD w handlerze deal-by-company ---', errorMessage);
    
    return res.status(500).json({ error: 'An internal server error occurred.' });
  }
}

export default withCORS(handler);
