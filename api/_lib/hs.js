const HS_BASE = 'https://api.hubapi.com';

export async function hsFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${HS_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_APP_TOKEN}`,
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${path} → ${res.status} ${txt}`);
  }
  return res.json();
}

export function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
