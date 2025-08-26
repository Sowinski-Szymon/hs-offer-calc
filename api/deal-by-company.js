// /api/deal-by-company.js
const { withCORS } = require('./_lib/cors');
const { hsFetch } = require('./_lib/hs');

// Domyślny pipeline ustawiony zgodnie z Twoją prośbą
const DEFAULT_PIPELINE_ID = '1978057944';

module.exports = withCORS(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { companyId, pipelineId } = req.query;
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const pipeline = String(pipelineId || DEFAULT_PIPELINE_ID);

    // Szukamy NAJNOWSZEGO deala skojarzonego z firmą w danym pipeline
    const searchBody = {
      filterGroups: [
        {
          filters: [
            { propertyName: 'associations.company', operator: 'EQ', value: String(companyId) },
            { propertyName: 'pipeline',              operator: 'EQ', value: pipeline }
          ]
        }
      ],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      limit: 1,
      properties: ['dealname', 'pipeline', 'dealstage', 'hubspot_owner_id']
    };

    const sr = await hsFetch(`/crm/v3/objects/deals/search`, {
      method: 'POST',
      body: JSON.stringify(searchBody)
    });

    const d = Array.isArray(sr?.results) && sr.results.length ? sr.results[0] : null;

    if (!d) {
      return res.status(200).json({ deal: null });
    }

    return res.status(200).json({
      deal: {
        id: d.id,
        name: d.properties?.dealname || '',
        pipeline: d.properties?.pipeline || '',
        stage: d.properties?.dealstage || '',
        ownerId: d.properties?.hubspot_owner_id || null
      }
    });
  } catch (e) {
    return res.status(500).json({ error: 'deal-by-company failed', detail: String(e && e.message || e) });
  }
});
