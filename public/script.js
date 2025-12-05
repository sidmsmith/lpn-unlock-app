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

// ===== SESSION TRACKING =====
const SESSION_STORAGE_KEY = 'lpn_unlock_session';
let sessionId = null;
let pageLoadTime = null;
let authAttemptCount = 0;
let firstAuthSuccess = true;

// Initialize session on page load
(function initSession() {
  pageLoadTime = Date.now();
  
  // Get or create session ID
  sessionId = sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) {
    sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }
  
  // Check if returning user
  const hasSavedPreferences = localStorage.getItem('lpn_unlock_theme') !== null;
  
  // Store for metadata collection
  window._appSession = {
    sessionId,
    pageLoadTime,
    hasSavedPreferences
  };
})();

// URL Parameters for cross-app integration
const urlParams = new URLSearchParams(window.location.search);
const locationParam = urlParams.get('Location');
const organizationParam = urlParams.get('Organization');
const businessUnitParam = urlParams.get('BusinessUnit');
const lpnParam = urlParams.get('LPN');

// Store URL parameters for use
const urlLocation = locationParam || null;
const urlOrg = organizationParam || null;
const urlBusinessUnit = businessUnitParam || null;
const urlLPN = lpnParam || null;

// Ensure ORG is blank on load (security) unless from URL
if (urlOrg) {
  orgInput.value = urlOrg.trim();
  // Hide auth section when auto-authenticating
  const authSection = document.getElementById('authSection');
  if (authSection) {
    authSection.style.display = 'none';
  }
} else {
  orgInput.value = '';
}

// Populate LPN field if LPN parameter is passed (do NOT auto-submit)
if (urlLPN) {
  // Wait for DOM to be ready
  setTimeout(() => {
    if (lpnInput) {
      lpnInput.value = urlLPN.trim();
      // Do NOT focus or auto-submit - let user review and update if needed
    }
  }, 100);
}

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

// ===== GENERIC METADATA COLLECTION (Reusable across all apps) =====
function getCommonMetadata(additionalMetadata = {}) {
  const now = Date.now();
  const timeOnPage = pageLoadTime ? Math.floor((now - pageLoadTime) / 1000) : 0;
  
  // Parse user agent
  const ua = navigator.userAgent;
  const browserInfo = parseUserAgent(ua);
  
  // Get screen info
  const screenWidth = window.screen.width;
  const screenHeight = window.screen.height;
  const screenResolution = `${screenWidth}x${screenHeight}`;
  
  // Get URL parameters
  const urlParamsObj = {};
  const currentUrlParams = new URLSearchParams(window.location.search);
  for (const [key, value] of currentUrlParams.entries()) {
    urlParamsObj[key] = value;
  }
  
  // Get theme
  const currentTheme = localStorage.getItem('lpn_unlock_theme') || 'dark';
  
  // Build common metadata
  const commonMetadata = {
    // Category 1: User/Browser Information
    user_agent: ua,
    browser_name: browserInfo.name,
    browser_version: browserInfo.version,
    device_type: getDeviceType(),
    os_name: browserInfo.os,
    os_version: browserInfo.osVersion,
    screen_resolution: screenResolution,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language || navigator.userLanguage,
    
    // Category 2: Session & Context
    session_id: sessionId,
    page_load_time: pageLoadTime ? new Date(pageLoadTime).toISOString() : null,
    time_on_page: timeOnPage,
    referrer: document.referrer || null,
    url_params: Object.keys(urlParamsObj).length > 0 ? urlParamsObj : null,
    auto_authenticated: urlOrg !== null,
    
    // Category 3: App State & Preferences
    theme: currentTheme,
    has_saved_preferences: window._appSession?.hasSavedPreferences || false,
    
    // Category 4: Authentication Context (will be overridden by event-specific data)
    auth_method: urlOrg ? 'url_param' : 'manual',
    auth_attempt_count: authAttemptCount,
    first_auth_success: firstAuthSuccess,
    
    // Category 7: Error & Debugging (will be populated if error occurs)
    // error_code, error_message, stack_trace, api_error_details - added per event
    
    // Category 8: Cross-App Integration
    source_app: urlParamsObj.Organization ? 'cross_app' : null,
    integration_type: urlOrg ? 'url_params' : 'direct',
    
    // Category 10: Geographic/Network
    request_origin: window.location.origin,
    
    // Merge any additional metadata
    ...additionalMetadata
  };
  
  return commonMetadata;
}

// Helper: Parse user agent
function parseUserAgent(ua) {
  let name = 'Unknown';
  let version = 'Unknown';
  let os = 'Unknown';
  let osVersion = 'Unknown';
  
  // Browser detection
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    name = 'Chrome';
    const match = ua.match(/Chrome\/([\d.]+)/);
    version = match ? match[1] : 'Unknown';
  } else if (ua.includes('Firefox')) {
    name = 'Firefox';
    const match = ua.match(/Firefox\/([\d.]+)/);
    version = match ? match[1] : 'Unknown';
  } else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    name = 'Safari';
    const match = ua.match(/Version\/([\d.]+)/);
    version = match ? match[1] : 'Unknown';
  } else if (ua.includes('Edg')) {
    name = 'Edge';
    const match = ua.match(/Edg\/([\d.]+)/);
    version = match ? match[1] : 'Unknown';
  }
  
  // OS detection
  if (ua.includes('Windows')) {
    os = 'Windows';
    const match = ua.match(/Windows NT ([\d.]+)/);
    if (match) {
      const ntVersion = match[1];
      const versionMap = {
        '10.0': '10/11',
        '6.3': '8.1',
        '6.2': '8',
        '6.1': '7'
      };
      osVersion = versionMap[ntVersion] || ntVersion;
    }
  } else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) {
    os = 'macOS';
    const match = ua.match(/Mac OS X ([\d_]+)/);
    if (match) {
      osVersion = match[1].replace(/_/g, '.');
    }
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  } else if (ua.includes('Android')) {
    os = 'Android';
    const match = ua.match(/Android ([\d.]+)/);
    osVersion = match ? match[1] : 'Unknown';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = 'iOS';
    const match = ua.match(/OS ([\d_]+)/);
    if (match) {
      osVersion = match[1].replace(/_/g, '.');
    }
  }
  
  return { name, version, os, osVersion };
}

// Helper: Get device type
function getDeviceType() {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) {
    return 'tablet';
  }
  if (/mobile|iphone|ipod|android|blackberry|opera|mini|windows\sce|palm|smartphone|iemobile/i.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
}

// Home Assistant tracking helper with enhanced metadata
async function trackEvent(eventName, metadata = {}) {
  try {
    // Get common metadata and merge with event-specific metadata
    const fullMetadata = getCommonMetadata(metadata);
    
    await api('ha-track', {
      event_name: eventName,
      metadata: fullMetadata
    });
  } catch (error) {
    // Silently fail - don't interrupt user experience
    console.warn('[HA] Failed to track event:', error);
  }
}

// ===== THEME SYSTEM =====
const THEME_STORAGE_KEY = 'lpn_unlock_theme';
const themeSelectorBtn = document.getElementById('themeSelectorBtn');
let themeModal = null;
const themeList = document.getElementById('themeList');

// Initialize Bootstrap modal after DOM is ready
if (typeof bootstrap !== 'undefined') {
  const modalElement = document.getElementById('themeModal');
  if (modalElement) {
    themeModal = new bootstrap.Modal(modalElement);
  }
}

const themes = {
  dark: {
    name: 'Dark',
    rootClass: 'theme-dark'
  },
  manhattan: {
    name: 'Manhattan',
    rootClass: 'theme-manhattan'
  }
};

// Load saved theme or default to dark
function loadTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  applyTheme(savedTheme);
}

// Apply theme
function applyTheme(themeName) {
  const root = document.documentElement;
  const theme = themes[themeName] || themes.dark;
  
  // Remove all theme classes
  Object.values(themes).forEach(t => {
    if (t.rootClass) {
      root.classList.remove(t.rootClass);
    }
  });
  
  // Apply selected theme
  if (theme.rootClass) {
    root.classList.add(theme.rootClass);
  }
  
  // Save to localStorage
  localStorage.setItem(THEME_STORAGE_KEY, themeName);
}

// Render theme list in modal
function renderThemeList() {
  if (!themeList) return;
  themeList.innerHTML = '';
  const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
  
  Object.entries(themes).forEach(([key, theme]) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `list-group-item list-group-item-action ${key === currentTheme ? 'active' : ''}`;
    item.textContent = theme.name;
    item.onclick = () => {
      applyTheme(key);
      if (themeModal) {
        themeModal.hide();
      }
    };
    themeList.appendChild(item);
  });
}

// Theme selector button click handler
if (themeSelectorBtn) {
  themeSelectorBtn.onclick = () => {
    renderThemeList();
    if (themeModal) {
      themeModal.show();
    }
  };
  
  // Ensure button is always visible after theme changes
  const observer = new MutationObserver(() => {
    if (themeSelectorBtn) {
      themeSelectorBtn.style.display = 'block';
      themeSelectorBtn.style.visibility = 'visible';
    }
  });
  
  // Observe theme class changes on root element
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });
}

// Load theme on page load
loadTheme();

// Ensure gear icon is visible after theme loads
if (themeSelectorBtn) {
  setTimeout(() => {
    themeSelectorBtn.style.display = 'block';
    themeSelectorBtn.style.visibility = 'visible';
  }, 100);
}

// === APP OPENED ON PAGE LOAD ===
window.addEventListener('load', async () => {
  // Track app opened with full metadata
  trackEvent('app_opened', {});
  
  await fetch('/api/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'app_opened' })
  });
  
  // Auto-authenticate if Organization parameter is provided in URL
  if (urlOrg) {
    await authenticate();
  }
});

// === AUTHENTICATE ===
async function authenticate() {
  const org = orgInput.value.trim();
  if (!org) {
    status('ORG required', 'error');
    mainUI.style.display = 'none';
    return;
  }
  
  // Increment auth attempt count
  authAttemptCount++;
  const authStartTime = Date.now();
  
  // Track auth attempt
  trackEvent('auth_attempt', {
    org: org || 'unknown',
    auth_attempt_count: authAttemptCount
  });
  
  status('Authenticating...');
  const res = await api('auth', { org });
  const authDuration = Date.now() - authStartTime;
  
  if (!res.success) {
    // Track auth failure
    trackEvent('auth_failed', {
      org: org || 'unknown',
      error: res.error || 'Auth failed',
      error_message: res.error || 'Auth failed',
      auth_attempt_count: authAttemptCount,
      auth_duration_ms: authDuration,
      token_received: false
    });
    
    status(res.error || 'Auth failed', 'error');
    mainUI.style.display = 'none';
    firstAuthSuccess = false;
    return;
  }
  
  token = res.token;
  status('Authenticated!', 'success');
  
  // Track auth success
  trackEvent('auth_success', {
    org: org,
    auth_attempt_count: authAttemptCount,
    auth_duration_ms: authDuration,
    token_received: true,
    first_auth_success: firstAuthSuccess
  });
  
  // Reset for next session (if they log out and back in)
  firstAuthSuccess = false;
  
  mainUI.style.display = 'block';
  await loadCodes(org);
  
  // If LPN was passed in URL, it's already populated, so don't auto-focus
  if (!urlLPN && lpnInput) {
    lpnInput.focus();
  }
}

orgInput.addEventListener('keypress', async e => {
  if (e.key !== 'Enter') return;
  await authenticate();
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

  // Parse LPN list
  const lpnList = lpn.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
  const lpnCount = lpnList.length;
  const actionStartTime = Date.now();

  // Track lock/unlock attempt with Category 5 metadata
  trackEvent(`${action}_attempt`, {
    org: org || 'unknown',
    lpn_count: String(lpnCount),
    lpn_list: lpnList,
    condition_code: code || 'N/A'
  });

  status('Working...');
  const apiStartTime = Date.now();
  const res = await api(action, { org, lpn, code });
  const apiResponseTime = Date.now() - apiStartTime;
  const actionDuration = Date.now() - actionStartTime;
  
  respEl.textContent = JSON.stringify(res.results || res, null, 2);
  
  // Track lock/unlock completion with Category 5 metadata
  trackEvent(`${action}_completed`, {
    org: org || 'unknown',
    success_count: String(res.success || 0),
    fail_count: String(res.fail || 0),
    total: String(res.total || 0),
    lpn_count: String(lpnCount),
    lpn_list: lpnList,
    condition_code: code || 'N/A',
    action_duration_ms: actionDuration,
    api_response_time_ms: apiResponseTime
  });
  
  status(`Done – ${res.success} success, ${res.fail} failed`, res.success > 0 ? 'success' : 'error');
}