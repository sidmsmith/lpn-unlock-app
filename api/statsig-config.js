// api/statsig-config.js
export default async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const clientKey = process.env.STATSIG_CLIENT_KEY;
    if (clientKey) {
      return res.json({ key: clientKey });
    } else {
      return res.json({
        error: "STATSIG_CLIENT_KEY not configured",
        note: "Please set STATSIG_CLIENT_KEY environment variable in Vercel project settings. The key should start with 'client-'"
      });
    }
  } catch (error) {
    console.error('[Statsig Config] Error:', error);
    return res.json({
      error: 'Failed to retrieve Statsig configuration.',
      note: 'Please set STATSIG_CLIENT_KEY in your Vercel project settings.'
    });
  }
}

