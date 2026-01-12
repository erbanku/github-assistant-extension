# GitHub Assistant - Chrome Extension

## Architecture Overview

Manifest V3 Chrome extension that adds navigation and management features to GitHub repository pages. Core capabilities:

-   **Fork Navigation**: One-click navigation to your forked repositories when viewing the upstream
-   **Import Repository**: Redirect to GitHub's import page with pre-filled details
-   **Quick Access Links**: Customizable buttons for frequent GitHub destinations (orgs, repos)
-   **Raw Page Enhancement**: Add navigation and copy buttons to raw.githubusercontent.com pages

### Component Structure

-   **[content.js](src/content.js)** (1400+ lines): Main logic - UI injection, GitHub API queries, navigation handling
-   **[popup.js](src/popup.js) + [popup.html](src/popup.html)**: Token configuration, settings management, quick links editor
-   **Storage**: `chrome.storage.sync` stores token, settings, and quick access links (encrypted by Chrome)

## Critical Patterns

### Multi-Context Initialization

`content.js` handles THREE distinct contexts with separate initialization:

```javascript
// 1. GitHub pages: Fork/import buttons, quick access
init();

// 2. GitHub import page: Auto-fill form from sessionStorage
autofillImportForm();

// 3. Raw content pages: Navigation and copy buttons
initRawPage();
```

**When adding features**: Determine which context(s) apply and call the appropriate init function.

### Settings-Gated Features

ALL features check settings before rendering:

```javascript
const DEFAULT_SETTINGS = {
    showImportButton: true,
    showQuickAccessLinks: true,
    showForkUpstreamButtons: true,
    showRawPageButtons: true,
};
```

Load settings cache with `await loadSettingsCache()` before checking `cachedSettings.showFeatureName`.

### Caching Strategy

Three cache variables avoid repeated storage reads:

-   `cachedGithubToken` - User's GitHub PAT
-   `cachedQuickAccessLinks` - Custom navigation links
-   `cachedSettings` - Feature toggles

Update caches via `chrome.storage.onChanged` listener. Re-initialize UI when cache changes.

### GitHub SPA Navigation

GitHub uses client-side routing. Extension uses **triple detection** to catch all navigations:

1. **history.pushState/replaceState interception**
2. **window popstate listener** (back/forward buttons)
3. **MutationObserver fallback** (100ms debounced)

```javascript
function handleNavigation() {
    // Remove existing buttons by ID to prevent duplicates
    document.getElementById("go-to-fork-container")?.remove();
    document.getElementById("back-to-upstream-container")?.remove();
    // ... remove others

    setTimeout(() => init(), 50); // Brief delay for DOM stability
}
```

**Critical**: Always remove existing elements by ID before re-injecting. GitHub's DOM changes are unpredictable.

## UI Injection Patterns

### Header Injection Selector Cascade

GitHub frequently changes their header structure. Use fallback chain:

```javascript
const header =
    document.querySelector(".AppHeader-context-full") || // Primary
    document.querySelector(".AppHeader-globalBar") || // Alternative
    document.querySelector(".AppHeader") || // Fallback
    document.querySelector("header"); // Generic
```

### Button Styling Convention

Match GitHub's design system:

-   Fork button: Green (`#238636`), hover `#2ea043`
-   Import button: Purple (`#6639ba`), hover `#7c52cc`
-   Quick access: Color-coded (blue/yellow/green/purple) with custom scheme
-   All buttons: `.btn .btn-sm`, 12px font, 6px border-radius, SVG icons from GitHub's octicons

### Dropdown Pattern (Multiple Forks)

When user has multiple forks, create split button with dropdown:

```javascript
if (forks.length === 1) {
    // Simple link button
} else {
    // Main button + arrow button + dropdown menu
    // Dropdown positioned absolute, closes on outside click
}
```

See `createForkButtonContainer()` for full implementation.

## API & Data Flow

### GitHub API Usage

All requests include `Authorization: token ${githubToken}` header. Parallel fetch pattern:

```javascript
const [userResp, repoResp] = await Promise.all([
    fetch("https://api.github.com/user", ...),
    fetch(`https://api.github.com/repos/${owner}/${repo}`, ...)
]);
```

**Rate limits**: 60/hour unauthenticated, 5000/hour authenticated. Log errors to console, don't show user-facing alerts.

### Fork Detection Logic

1. Get current repo details to determine if it's a fork
2. If fork, use `repoData.source` as source repo (handles transitive forks)
3. Fetch paginated forks list from source repo (100 per page)
4. Filter for user's personal account + their organizations
5. Stop pagination early if forks found (performance optimization)

### Import Flow

Modern flow uses GitHub's official importer:

1. Store import data in `sessionStorage` with timestamp
2. Redirect to `https://github.com/new/import`
3. `autofillImportForm()` detects import page, reads sessionStorage
4. Auto-fills form fields (URL, name, description) with retry logic
5. Shows purple banner with instructions (especially for private repos)

**Key detail**: Import data expires after 30 seconds to prevent stale fills.

## Storage Schema

```javascript
{
    "githubToken": "ghp_..." | "github_pat_...",
    "extensionSettings": {
        showImportButton: boolean,
        showQuickAccessLinks: boolean,
        showForkUpstreamButtons: boolean,
        showRawPageButtons: boolean
    },
    "quickAccessLinks": [
        { name: string, url: string, color: "blue"|"yellow"|"green"|"purple", link_num: string }
    ]
}
```

Token validation requires `ghp_` or `github_pat_` prefix. Settings merge with defaults on load.

## Development Workflows

### Loading Extension

1. `chrome://extensions/` → Enable "Developer mode"
2. "Load unpacked" → Select repo root directory
3. Configure token via popup (needs `repo` and `read:org` scopes)

### Testing Checklist

Context-specific scenarios:

**GitHub pages**:

-   Forked repo (buttons appear)
-   Own repo (no buttons)
-   Upstream repo not forked (no fork button, import button shows)
-   Multiple forks (dropdown appears)
-   SPA navigation (buttons persist)

**Raw pages** (`raw.githubusercontent.com`, `gist.githubusercontent.com`):

-   "Go to File/Gist" button in top-right
-   "Copy All" button works with `<pre>` content

**Settings**:

-   Toggle each feature, verify UI updates without page reload
-   Quick links: Add/remove/reorder, test color schemes
-   Token reset: Verify buttons disappear

### Debugging Tips

-   Console logs prefixed with `GitHub Assistant:` show initialization flow
-   Common issues:
    -   **Buttons not appearing**: Check token validity, settings state, console errors
    -   **Duplicate buttons**: Navigation handler should remove old elements first
    -   **API failures**: Verify token scopes, check rate limits
    -   **DOM not found**: GitHub changed selectors (update fallback chain)

### Common Pitfalls

-   Don't rely on page reloads for testing SPA navigation
-   GitHub's DOM structure changes frequently - test against live github.com
-   `sessionStorage` data persists only within same-origin tabs, not across navigations
-   Quick access links use array index for positioning - maintain order when editing

## Key Files

-   [src/content.js](src/content.js): Core extension logic (init, API calls, UI injection)
-   [src/popup.js](src/popup.js): Settings UI, token validation, quick links editor (form + JSON views)
-   [src/manifest.json](src/manifest.json): Permissions, content script targets, host permissions
-   [src/popup.html](src/popup.html): Popup UI with tabbed settings interface

## External APIs

**GitHub REST API v3** - All endpoints:

-   `GET /user` - Current user info
-   `GET /user/orgs` - User's organizations (for fork detection + quick links reset)
-   `GET /repos/:owner/:repo` - Repository details (fork status, parent, source)
-   `GET /repos/:owner/:repo/forks` - List forks (paginated, 100/page)
