// api/validate.js
import fetch from 'node-fetch';

const AUTH_HOST = process.env.MANHATTAN_AUTH_HOST || "salep-auth.sce.manh.com";
const API_HOST = process.env.MANHATTAN_API_HOST || "salep.sce.manh.com";
const CLIENT_ID = process.env.MANHATTAN_CLIENT_ID || "omnicomponent.1.0.0";
const CLIENT_SECRET = process.env.MANHATTAN_SECRET;
const PASSWORD = process.env.MANHATTAN_PASSWORD;
const USERNAME_BASE = process.env.MANHATTAN_USERNAME_BASE || "sdtadmin@";

// Get OAuth token
async function getToken(org) {
  const url = `https://${AUTH_HOST}/oauth/token`;
  const username = `${USERNAME_BASE}${org.toLowerCase()}`;
  const body = new URLSearchParams({
    grant_type: 'password',
    username,
    password: PASSWORD
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
    },
    body
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token;
}

// API call wrapper
async function apiCall(method, path, token, org, body = null) {
  const url = `https://${API_HOST}${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    selectedOrganization: org,
    selectedLocation: `${org}-DM1`
  };

  const res = await fetch(url, { 
    method, 
    headers, 
    body: body ? JSON.stringify(body) : undefined 
  });
  return res.ok ? await res.json() : { error: await res.text() };
}

// Home Assistant webhook helper
const HA_WEBHOOK_URL = "http://sidmsmith.zapto.org:8123/api/webhook/manhattan_app_usage";

async function sendHAMessage(payload) {
  try {
    // Use AbortController for timeout in Node.js
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    await fetch(HA_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
  } catch (error) {
    // Silently fail - don't interrupt user experience
    if (error.name !== 'AbortError') {
      console.warn('[HA] Failed to send webhook:', error.message);
    }
  }
}

// Export handler
export default async function handler(req, res) {
  console.log(`[API] ${req.method} ${req.url}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, org, lpn, code } = req.body;

  // === APP OPENED (NO ORG) ===
  if (action === 'app_opened') {
    // Track app opened event (metadata will be added by frontend)
    return res.json({ success: true });
  }

  // === HA TRACK EVENT ===
  if (action === 'ha-track') {
    const { event_name, metadata } = req.body;
    
    // Build complete payload with app info and timestamp
    const payload = {
      event_name,
      app_name: 'lpn-unlock-app',
      app_version: '2.4.0',
      ...metadata,
      timestamp: new Date().toISOString()
    };
    
    sendHAMessage(payload);
    return res.json({ success: true });
  }

  // === AUTHENTICATE ===
  if (action === 'auth') {
    const token = await getToken(org);
    if (!token) {
      return res.json({ success: false, error: "Auth failed" });
    }
    return res.json({ success: true, token });
  }

  // === GET CONDITION CODES ===
  if (action === 'get-codes') {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "No token" });

    const codesRes = await apiCall('GET', '/dcinventory/api/dcinventory/conditionCode?size=50', token, org);
    const items = codesRes.data || [];
    const codes = items
      .map(x => ({ code: x.ConditionCodeId, desc: x.Description }))
      .sort((a, b) => a.code.localeCompare(b.code));
    codes.unshift({ code: '', desc: 'Select Code' });

    return res.json({ codes });
  }

  // === Need token ===
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: "No token" });

  const lpns = lpn?.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean) || [];
  if (!lpns.length) return res.json({ error: "No LPNs" });

  let success = 0, fail = 0;
  const results = {};

  for (const l of lpns) {
    const searchRes = await apiCall('POST', '/dcinventory/api/dcinventory/inventory/search', token, org, {
      Query: `InventoryContainerId = '${l}'`, Size: 1, Page: 0
    });
    const exists = searchRes?.header?.totalCount > 0;
    if (!exists) {
      results[l] = { error: "LPN does not exist" };
      fail++;
      continue;
    }

    if (action === 'lock') {
      if (!code) { results[l] = { error: "No code" }; fail++; continue; }
      const current = await apiCall('POST', '/dcinventory/api/dcinventory/containerCondition/search', token, org, {
        Query: `InventoryContainerId = ${l} and InventoryContainerTypeId = ILPN`, Page: 0
      });
      const hasCode = current.data?.some(x => x.ConditionCode === code);
      if (hasCode) {
        results[l] = { error: `Already locked with ${code}` };
        fail++;
      } else {
        const lockRes = await apiCall('POST', '/dcinventory/api/dcinventory/containerCondition/save', token, org, {
          InventoryContainerTypeId: "ILPN",
          CreatedBy: `sdtadmin@${org.toLowerCase()}`,
          ConditionCode: code,
          OrgId: org,
          FacilityId: `${org}-DM1`,
          UpdatedBy: `sdtadmin@${org.toLowerCase()}`,
          InventoryContainerId: l
        });
        results[l] = lockRes;
        if (lockRes.success !== false) success++; else fail++;
      }
    }

    if (action === 'unlock') {
      const current = await apiCall('POST', '/dcinventory/api/dcinventory/containerCondition/search', token, org, {
        Query: `InventoryContainerId = ${l} and InventoryContainerTypeId = ILPN`, Page: 0
      });
      const codes = current.data?.map(x => x.ConditionCode) || [];
      if (!codes.length) {
        results[l] = { error: "No condition codes" };
        fail++;
        continue;
      }

      if (!code) {
        for (const c of codes) {
          if (!c) continue;
          const delRes = await apiCall('POST', '/dcinventory/api/dcinventory/containerCondition/deleteContainerConditions', token, org, {
            InventoryContainerTypeId: "ILPN",
            CreatedBy: `sdtadmin@${org.toLowerCase()}`,
            ConditionCode: c,
            OrgId: org,
            FacilityId: `${org}-DM1`,
            UpdatedBy: `sdtadmin@${org.toLowerCase()}`,
            InventoryContainerId: l
          });
          results[`${l} (remove ${c})`] = delRes;
          if (delRes.success !== false) success++; else fail++;
        }
      } else {
        if (!codes.includes(code)) {
          results[l] = { error: `Not locked with ${code}` };
          fail++;
        } else {
          const delRes = await apiCall('POST', '/dcinventory/api/dcinventory/containerCondition/deleteContainerConditions', token, org, {
            InventoryContainerTypeId: "ILPN",
            CreatedBy: `sdtadmin@${org.toLowerCase()}`,
            ConditionCode: code,
            OrgId: org,
            FacilityId: `${org}-DM1`,
            UpdatedBy: `sdtadmin@${org.toLowerCase()}`,
            InventoryContainerId: l
          });
          results[l] = delRes;
          if (delRes.success !== false) success++; else fail++;
        }
      }
    }
  }

  res.json({ results, success, fail, total: lpns.length });
}

export const config = { api: { bodyParser: true } };