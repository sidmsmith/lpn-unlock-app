// public/script.js
const orgInput = document.getElementById('org');
const mainUI = document.getElementById('mainUI');
const lpnInput = document.getElementById('lpn');
const codeSelect = document.getElementById('code');
const lockBtn = document.getElementById('lockBtn');
const unlockBtn = document.getElementById('unlockBtn');
const statusEl = document.getElementById('status');
const respEl = document.getElementById('response');

let token = null;
let codes = [];

// Show status
function status(text, type = 'info') {
  statusEl.textContent = text;
  statusEl.className = `status text-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'}`;
}

// API call helper
async function api(action, data = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch('/api/validate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, ...data })
  }).then(r => r.json());
}

// === APP OPENED ON PAGE LOAD ===
window.addEventListener('load', async () => {
  // Track app opened in Statsig
  if (window.StatsigTracking && window.StatsigTracking.isInitialized()) {
    window.StatsigTracking.logEvent('app_opened', {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    });
  }
  
  await fetch('/api/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'app_opened' })
  });
});

// === AUTHENTICATE ===
orgInput.addEventListener('keypress', async e => {
  if (e.key !== 'Enter') return;
  const org = orgInput.value.trim();
  if (!org) return status('ORG required', 'error');
  status('Authenticating...');
  
  // Track auth attempt in Statsig
  if (window.StatsigTracking && window.StatsigTracking.isInitialized()) {
    window.StatsigTracking.logEvent('auth_attempt', {
      org: org,
      timestamp: new Date().toISOString()
    });
  }
  
  const res = await api('auth', { org });
  if (!res.success) {
    status(res.error || 'Auth failed', 'error');
    mainUI.style.display = 'none';
    
    // Track auth failure in Statsig
    if (window.StatsigTracking && window.StatsigTracking.isInitialized()) {
      window.StatsigTracking.logEvent('auth_failed', {
        org: org,
        error: res.error || 'Auth failed',
        timestamp: new Date().toISOString()
      });
    }
    return;
  }
  token = res.token;
  status('Authenticated!', 'success');
  mainUI.style.display = 'block';
  
  // Track auth success in Statsig
  if (window.StatsigTracking && window.StatsigTracking.isInitialized()) {
    window.StatsigTracking.logEvent('auth_success', {
      org: org,
      timestamp: new Date().toISOString()
    });
  }
  
  await loadCodes(org);
});

async function loadCodes(org) {
  const codeSelect = document.getElementById('code');
  codeSelect.innerHTML = '<option value="">Loading codes...</option>';

  try {
    const res = await api('get-codes', { org });
    if (res.codes) {
      codeSelect.innerHTML = '<option value="">Select Code</option>' +
        res.codes.map(c => `<option value="${c.code}">${c.code} - ${c.desc}</option>`).join('');
    } else {
      codeSelect.innerHTML = '<option value="">No codes found</option>';
    }
  } catch (err) {
    codeSelect.innerHTML = '<option value="">Load failed</option>';
    console.error("Code load error:", err);
  }
}

// Lock / Unlock
lockBtn.onclick = () => runAction('lock');
unlockBtn.onclick = () => runAction('unlock');

async function runAction(action) {
  const org = orgInput.value.trim();
  const lpn = lpnInput.value;
  const code = codeSelect.value;
  if (!lpn) return status('Enter LPN(s)', 'error');
  if (action === 'lock' && !code) return status('Select code to lock', 'error');

  status('Working...');
  
  // Track action attempt in Statsig
  if (window.StatsigTracking && window.StatsigTracking.isInitialized()) {
    const lpnList = lpn.split(/[\s,;]+/).filter(Boolean);
    window.StatsigTracking.logEvent(`${action}_attempt`, {
      org: org,
      lpn_count: lpnList.length,
      condition_code: code || null,
      timestamp: new Date().toISOString()
    });
  }
  
  const res = await api(action, { org, lpn, code });
  respEl.textContent = JSON.stringify(res.results || res, null, 2);
  status(`Done – ${res.success} success, ${res.fail} failed`, res.success > 0 ? 'success' : 'error');
  
  // Track action completion in Statsig
  if (window.StatsigTracking && window.StatsigTracking.isInitialized()) {
    const lpnList = lpn.split(/[\s,;]+/).filter(Boolean);
    window.StatsigTracking.logEvent(`${action}_completed`, {
      org: org,
      lpn_count: lpnList.length,
      success_count: res.success || 0,
      fail_count: res.fail || 0,
      condition_code: code || null,
      timestamp: new Date().toISOString()
    });
  }
}