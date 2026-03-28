# Agent notes

## Repository

- Chrome extension (Manifest V3): GitHub Assistant; packaged source under `src/`.
- Public listing: Chrome Web Store item ID `gmafgjjojobkaegbpnmkjlhjnfcbokdj` (see README link).
- Upstream GitHub remote referenced in docs/PRs: `erbanku/github-assistant-extension`.

## GitHub Actions secrets (Chrome Web Store API)

For workflows that publish or call the Chrome Web Store API, these repository secret names are conventional:

- `CHROME_EXTENSION_ID` – Web Store extension ID (same as the ID in the store URL path).
- `CHROME_CLIENT_ID` – OAuth 2.0 client ID from Google Cloud (Chrome Web Store API credentials).
- `CHROME_CLIENT_SECRET` – OAuth client secret from the same credentials (not optional for token refresh flows).
- `CHROME_REFRESH_TOKEN` – Refresh token from the OAuth flow with scope `https://www.googleapis.com/auth/chromewebstore`.

Setting secrets with the GitHub CLI requires an account that has permission to manage Actions secrets on that repository (e.g. `gh auth switch` to the repo owner if the default account gets HTTP 403 on `gh secret set`).

Short-lived access tokens from OAuth are not usually stored as repo secrets; CI should obtain access tokens using the refresh token and client credentials.

## Publish workflow (`.github/workflows/publish.yml`)

- Uses [mnao305/chrome-extension-upload](https://github.com/mnao305/chrome-extension-upload) (`v5.0.0`) to upload the zipped `src/` tree; the previous action `trmcnvn/upload-google-chrome-extension` is no longer available on GitHub.
- **When it runs:** Push to `main` that modifies `src/manifest.json`, but the **publish and release jobs only run if the `version` field changed** compared to the parent commit (other manifest edits exit early after the check job). `workflow_dispatch` always runs publish and release for the selected branch (escape hatch; does not compare to parent).
- **GitHub release:** On publish, [softprops/action-gh-release](https://github.com/softprops/action-gh-release) creates tag `v{version}` at the workflow commit, attaches `extension.zip`, and enables generated release notes. Requires default `GITHUB_TOKEN` `contents: write` on the publish job.
- **Version source:** `src/manifest.json` `version`; release tag is `v` plus that value. Ensure the tag does not already exist on the repo (avoid reusing a version number).

## Security

- Never commit OAuth tokens, refresh tokens, or client secrets. Rotate credentials if they may have been exposed outside GitHub encrypted secrets.
