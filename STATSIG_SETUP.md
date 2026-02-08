# Statsig Tracking Setup

Statsig tracking has been integrated into the lpn-unlock-app. This document explains how to configure it.

## Overview

Statsig tracking is now enabled and will track the following events:
- `app_opened` - When the app loads
- `auth_attempt` - When user attempts to authenticate
- `auth_success` - When authentication succeeds
- `auth_failed` - When authentication fails
- `lock_attempt` - When user attempts to lock LPNs
- `lock_completed` - When lock operation completes
- `unlock_attempt` - When user attempts to unlock LPNs
- `unlock_completed` - When unlock operation completes

## Configuration

### 1. Get Your Statsig Client SDK Key

1. Sign up or log in to [Statsig](https://www.statsig.com/)
2. Create a new project or select an existing one
3. Navigate to Settings → API Keys
4. Copy your **Client SDK Key** (starts with `client-`)

### 2. Set the Client Key

**Important**: You need a **Client SDK Key** (starts with `client-`), NOT a Server Secret (starts with `secret-`).

If you only have `STATSIG_SERVER_SECRET`, you need to:
1. Go to your Statsig dashboard → Settings → API Keys
2. Create or copy a **Client SDK Key** (different from Server Secret)

#### Set via Environment Variable (Recommended)

1. In your Vercel project settings, go to Environment Variables
2. Add a new variable:
   - **Name**: `STATSIG_CLIENT_KEY`
   - **Value**: Your Statsig **Client SDK Key** (starts with `client-`)
   - **Environment**: Production, Preview, Development

3. The app will automatically fetch this key from the server endpoint `/api/statsig-config`

#### Alternative: Set via JavaScript (For testing only)

Edit `public/statsig.js` and replace the default key:

```javascript
const DEFAULT_STATSIG_CLIENT_KEY = 'client-YOUR-ACTUAL-KEY-HERE';
```

**Note**: The Server Secret (`STATSIG_SERVER_SECRET`) is for server-side operations only and should NEVER be exposed to the browser.

### 3. Alternative: Use npm Package (Optional)

If the CDN approach doesn't work, you can install the Statsig SDK via npm:

```bash
npm install statsig-js
```

Then update `public/statsig.js` to import it:

```javascript
import Statsig from 'statsig-js';
```

Note: This requires a build step to bundle the JavaScript.

## How It Works

1. **SDK Loading**: The Statsig JavaScript SDK is loaded from CDN when the page loads
2. **Initialization**: Statsig is initialized with your client SDK key
3. **Event Tracking**: Events are automatically logged when users interact with the app
4. **User Identification**: A unique user ID is generated and stored in localStorage

## Events Tracked

### app_opened
- **When**: Page loads
- **Data**: timestamp, userAgent

### auth_attempt
- **When**: User enters ORG and presses Enter
- **Data**: org, timestamp

### auth_success
- **When**: Authentication succeeds
- **Data**: org, timestamp

### auth_failed
- **When**: Authentication fails
- **Data**: org, error message, timestamp

### lock_attempt / unlock_attempt
- **When**: User clicks Lock or Unlock button
- **Data**: org, lpn_count, condition_code (for lock), timestamp

### lock_completed / unlock_completed
- **When**: Lock/Unlock operation finishes
- **Data**: org, lpn_count, success_count, fail_count, condition_code (for lock), timestamp

## Viewing Data

1. Log in to your [Statsig Dashboard](https://console.statsig.com/)
2. Navigate to Metrics → Events
3. You'll see all tracked events with their associated data

## Troubleshooting

### SDK Not Loading
- Check browser console for errors
- Verify CDN URLs are accessible
- Consider using npm package instead of CDN

### Events Not Appearing
- Verify your Statsig client SDK key is correct
- Check browser console for Statsig initialization errors
- Ensure Statsig is initialized before events are logged (check `window.StatsigTracking.isInitialized()`)

### User ID Issues
- User IDs are stored in localStorage
- Clearing browser data will generate a new user ID
- User IDs are prefixed with `user_` and include a random component

## Testing

To test Statsig tracking:

1. Open the app in your browser
2. Open browser DevTools → Console
3. Look for `[Statsig]` log messages
4. Perform actions (auth, lock, unlock)
5. Check Statsig dashboard for events (may take a few minutes to appear)

## Notes

- Statsig tracking runs alongside Vercel Analytics (both are active)
- Events are logged asynchronously and won't block the UI
- If Statsig fails to initialize, the app continues to work normally
- All tracking is client-side only

