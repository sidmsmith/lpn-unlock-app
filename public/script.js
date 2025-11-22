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
  status('Authenticating...');
  const res = await api('auth', { org });
  if (!res.success) {
    status(res.error || 'Auth failed', 'error');
    mainUI.style.display = 'none';
    return;
  }
  token = res.token;
  status('Authenticated!', 'success');
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

  status('Working...');
  const res = await api(action, { org, lpn, code });
  respEl.textContent = JSON.stringify(res.results || res, null, 2);
  status(`Done – ${res.success} success, ${res.fail} failed`, res.success > 0 ? 'success' : 'error');
}