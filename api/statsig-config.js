// api/statsig-config.js
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const clientKey = process.env.STATSIG_CLIENT_KEY;

  if (!clientKey) {
    return res.status(500).json({
      error: 'STATSIG_CLIENT_KEY environment variable not set.',
      note: 'Please set this in your Vercel project settings. It should start with "client-".'
    });
  }

  return res.status(200).json({ key: clientKey });
}
