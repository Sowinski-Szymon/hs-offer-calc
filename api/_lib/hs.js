const HS_BASE = 'https://api.hubapi.com';

async function hsFetch(path, { method = 'GET', body, headers = {} } = {}, attempt = 1) {
  const res = await fetch(`${HS_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_PRIVATE_APP_TOKEN}`,
      'Content-Type': 'application/json',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
    if (attempt <= 5) {
      const retryAfter = Number(res.headers.get('Retry-After')) || Math.min(2 ** attempt, 10);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return hsFetch(path, { method, body, headers }, attempt + 1);
    }
  }

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`${path} → ${res.status} ${txt}`);
  }

  return res.json();
}

module.exports = { hsFetch };
