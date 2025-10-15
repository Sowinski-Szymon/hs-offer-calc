// /api/update-deal.js
import { withCORS } from './_lib/cors.js';
import { Client } from '@hubspot/api-client';

async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { dealId, properties } = req.body;
    const accessToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    
    if (!dealId) {
      return res.status(400).json({ error: 'dealId is required' });
    }
    
    if (!properties || typeof properties !== 'object' || Object.keys(properties).length === 0) {
      return res.status(400).json({ error: 'properties are required and must contain at least one property' });
    }
    
    if (!accessToken) {
      console.error('Błąd konfiguracji serwera: Brak HUBSPOT_PRIVATE_APP_TOKEN.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const hubspotClient = new Client({ accessToken });
    
    try {
      console.log(`Updating deal ${dealId} with properties:`, properties);
      
      // Aktualizuj deal w HubSpot
      const updatedDeal = await hubspotClient.crm.deals.basicApi.update(dealId, {
        properties
      });
      
      console.log(`Deal ${dealId} updated successfully`);
      
      return res.status(200).json({ 
        success: true,
        deal: {
          id: updatedDeal.id,
          properties: updatedDeal.properties
        }
      });
      
    } catch (apiError) {
      console.error('HubSpot API error details:', {
        message: apiError.message,
        body: apiError.body,
        statusCode: apiError.statusCode
      });
      throw apiError;
    }
    
  } catch (e) {
    const errorMessage = e.body ? JSON.stringify(e.body) : e.message;
    console.error('--- BŁĄD w update-deal ---', errorMessage);
    return res.status(500).json({ 
      error: 'Failed to update deal', 
      detail: String(e?.message || e) 
    });
  }
}

export default withCORS(handler);
