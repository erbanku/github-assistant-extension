# Go to Fork Chrome Extension

A Chrome extension that shows convenient navigation and import buttons when viewing repositories on GitHub.

Chrome Web Store:
https://chromewebstore.google.com/detail/github-go-to-fork/gmafgjjojobkaegbpnmkjlhjnfcbokdj

## Features

-   **Go to Fork**: One-click navigation to your forked repository when viewing the upstream
-   **Import Repository**: Redirects to GitHub's import page with pre-filled repository details (URL, name, description)
-   **Back to Upstream**: Easy navigation from your fork back to the original repository
-   **Smart Naming**: Automatically handles name conflicts by appending numbers (repo-1, repo-2, etc.)
-   **Multi-account Support**: Checks all your organizations and personal accounts
-   **Dropdown Menu**: When multiple forks exist, shows all options in a dropdown
-   **Seamless Integration**: Buttons integrate naturally with GitHub's UI
-   **Import with Attribution**: Automatically adds "Imported Repo, Original: [url]" to description

## Installation

1. Clone or download this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked" and select this extension folder
5. Click the extension icon in your browser toolbar
6. Click "Generate Token on GitHub" to create a personal access token with these scopes:
    - `repo` - Full control of private repositories (required for imports)
    - `read:org` - Read organization membership
7. Copy the generated token and paste it into the extension popup
8. Click "Save Token"

## How Import Works

The "Import Repository" button redirects you to GitHub's official import page with all details pre-filled:

-   Repository URL (source)
-   Repository name (with conflict handling)
-   Description (includes original repo attribution)
-   Visibility (set to private by default)

Simply click "Begin Import" on GitHub's page to complete the import process.

## Required Permissions

-   `repo` - Full control of private repositories (for creating private imports)
-   `read:org` - Read organization membership

## Privacy

-   Only works on `github.com` pages
-   Uses your GitHub Personal Access Token stored locally in your browser
-   Only requests minimum required permissions
-   Does not send your token or any data to external servers
-   Does not track your activity
-   Token is stored securely using Chrome's sync storage (encrypted)

## License

MIT License

See [LICENSE](LICENSE) file for details.
