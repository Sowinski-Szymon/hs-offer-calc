// /api/update-company.js
import { withCORS } from './_lib/cors.js';
import { Client } from '@hubspot/api-client';

async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const accessToken = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
    if (!accessToken) {
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const { companyId, properties } = req.body;
    if (!companyId || !properties) {
      return res.status(400).json({ error: 'companyId and properties are required' });
    }

    const hubspotClient = new Client({ accessToken });
    
    await hubspotClient.crm.companies.basicApi.update(companyId, {
      properties
    });

    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('update-company error:', e);
    return res.status(500).json({ 
      error: 'Failed to update company', 
      detail: String(e?.message || e) 
    });
  }
}

export default withCORS(handler);
