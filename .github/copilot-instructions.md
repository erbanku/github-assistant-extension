# GitHub Assistant - Chrome Extension

## Architecture Overview

This is a Manifest V3 Chrome extension that injects a "GitHub Assistant" button into GitHub repository pages when the user has forked that repository. It consists of three main components:

-   **Content Script** (`src/content.js`): Injected into all `github.com` pages, detects repo URLs, queries GitHub API, and injects UI
-   **Popup UI** (`src/popup.html` + `src/popup.js`): Extension popup for GitHub token configuration and management
-   **Storage**: Uses `chrome.storage.sync` to persist the GitHub Personal Access Token (encrypted by Chrome)

## Key Workflows

### GitHub SPA Navigation Detection

GitHub uses client-side routing. The extension handles this with a MutationObserver pattern:

```javascript
let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        init();
    }
}).observe(document, { subtree: true, childList: true });
```

Always use this pattern when adding features that respond to navigation—don't rely on page reloads.

### Fork Detection Algorithm

The extension follows this flow:

1. Parse current repo URL (`/owner/repo` format only)
2. Fetch repo details to determine if it's a fork and find the source repository
3. Fetch all forks of the source repository (paginated, 100 per page)
4. Filter forks owned by the authenticated user or their organizations
5. Stop pagination early if matching forks are found

See `findAllForks()` in `content.js` for implementation.

### UI Injection Strategy

The button is appended directly to `.AppHeader-context-full` or fallback selectors. GitHub's header structure is:

-   Primary target: `.AppHeader-context-full`
-   Fallback 1: `.AppHeader`
-   Fallback 2: `header` (generic)

Always remove existing `#go-to-fork-container` before injecting to prevent duplicates.

## Project Conventions

### API Interaction

-   All GitHub API calls use the `Authorization: token ${githubToken}` header
-   Token validation checks for required scopes: `public_repo` and `read:org` via `X-OAuth-Scopes` response header
-   Graceful degradation: Log errors to console but don't show UI errors to avoid cluttering GitHub pages

### UI/UX Patterns

-   **Single fork**: Green button with fork icon + "GitHub Assistant" text
-   **Multiple forks**: Split button with dropdown menu showing `owner/name` for each fork
-   Styling matches GitHub's design system (`.btn`, `.btn-sm`, green `#238636` primary color)
-   Dropdown closes on outside click using global document listener

### Storage Schema

```javascript
{
  "githubToken": "ghp_..." // or "github_pat_..."
}
```

Token format validation enforces `ghp_` or `github_pat_` prefixes.

## Development & Testing

### Loading the Extension

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the repository root directory

### Testing Checklist

-   Test on repo you've forked (button should appear)
-   Test on repo you haven't forked (no button)
-   Test on your own repos (no button - don't show on own repos)
-   Test with multiple forks (dropdown should appear)
-   Test GitHub SPA navigation (button should persist across navigation)
-   Test token validation with invalid/missing scopes

### Common Pitfalls

-   **Button not appearing**: Check console logs prefixed with `GitHub Assistant:`
-   **Duplicate buttons**: Ensure `#go-to-fork-container` removal happens before injection
-   **API rate limits**: GitHub unauthenticated rate limit is 60/hour; authenticated is 5000/hour
-   **Header selector changes**: GitHub frequently updates their DOM structure; test against current GitHub UI

## File Reference

-   **`src/manifest.json`**: Extension manifest, permissions, and content script configuration
-   **`src/content.js`**: Core fork detection and button injection logic (403 lines)
-   **`src/popup.js`**: Token management UI logic with validation
-   **`src/popup.html`**: Popup UI with setup/configured views
-   **`src/assets/`**: Extension icons (16px, 48px, 128px)

## External Dependencies

-   **GitHub REST API v3**: Used for all data fetching
    -   `/user` - Get authenticated user info
    -   `/repos/:owner/:repo` - Get repository details
    -   `/repos/:owner/:repo/forks` - List repository forks (paginated)
    -   `/user/orgs` - List user organizations
