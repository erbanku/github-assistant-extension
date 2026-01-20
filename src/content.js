// Cache for quick access links to avoid repeated storage reads
let cachedQuickAccessLinks = null;
let cachedGithubToken = null;
let cachedSettings = null;

// Default settings - all features enabled by default
const DEFAULT_SETTINGS = {
    showImportButton: true,
    showQuickAccessLinks: true,
    showForkUpstreamButtons: true,
    showRawPageButtons: true,
};

// Load quick access links into cache
async function loadQuickAccessLinksCache() {
    const result = await new Promise((resolve) => {
        chrome.storage.sync.get(["quickAccessLinks"], resolve);
    });
    cachedQuickAccessLinks = result.quickAccessLinks || [];
}

// Load GitHub token into cache
async function loadGithubTokenCache() {
    const result = await new Promise((resolve) => {
        chrome.storage.sync.get(["githubToken"], resolve);
    });
    cachedGithubToken = result.githubToken || null;
}

// Load settings into cache
async function loadSettingsCache() {
    const result = await new Promise((resolve) => {
        chrome.storage.sync.get(["extensionSettings"], resolve);
    });
    cachedSettings = {
        ...DEFAULT_SETTINGS,
        ...(result.extensionSettings || {}),
    };
}

// Listen for storage changes to update cache
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync") {
        if (changes.quickAccessLinks) {
            cachedQuickAccessLinks = changes.quickAccessLinks.newValue || [];
            // Re-inject buttons with new settings
            injectQuickAccessButtons();
        }
        if (changes.githubToken) {
            cachedGithubToken = changes.githubToken.newValue || null;
            // Re-initialize to update fork/upstream/import buttons
            init();
        }
        if (changes.extensionSettings) {
            cachedSettings = {
                ...DEFAULT_SETTINGS,
                ...(changes.extensionSettings.newValue || {}),
            };
            // Re-initialize to apply new settings
            init();
            initRawPage();
        }
    }
});

// GitHub has deprecated the import API endpoint.
// Now we redirect users to GitHub's official import tool.
function handleImportRepo(owner, repo, repoData, currentUser, githubToken) {
    // Store import data in sessionStorage for the import page to read
    sessionStorage.setItem(
        "gh_import_data",
        JSON.stringify({
            url: repoData.clone_url,
            name: repo,
            description: repoData.description || "",
            private: repoData.private,
            username: currentUser,
            token: githubToken,
            timestamp: Date.now(),
        }),
    );

    // Redirect to GitHub's import page with just the URL
    const importUrl = `https://github.com/new/import`;
    window.location.href = importUrl;
}

// Inject quick access buttons for custom links
async function injectQuickAccessButtons() {
    // Don't inject on raw pages
    if (
        window.location.hostname.includes("raw.githubusercontent.com") ||
        window.location.hostname.includes("gist.githubusercontent.com")
    ) {
        return;
    }

    // Check settings
    if (cachedSettings === null) {
        await loadSettingsCache();
    }
    if (!cachedSettings.showQuickAccessLinks) {
        return;
    }

    // Remove existing container if present
    const existing = document.getElementById(
        "github-assistant-quick-access-container",
    );
    if (existing) {
        existing.remove();
    }

    // Use cached links if available, otherwise load from storage
    if (cachedQuickAccessLinks === null) {
        await loadQuickAccessLinksCache();
    }

    const links = cachedQuickAccessLinks;
    const activeLinks = links.filter((link) => link.url);

    if (activeLinks.length === 0) {
        return;
    }

    // Find the search button group in the top navigation
    const searchButtonGroup =
        document.querySelector(".Search-module__searchButtonGroup--L3A4O") ||
        document.querySelector('[data-testid="top-nav-center"]');

    if (!searchButtonGroup) {
        console.log(
            "GitHub Assistant: Could not find search button group for quick access buttons",
        );
        return;
    }

    // Create container for quick access buttons
    const container = document.createElement("div");
    container.id = "github-assistant-quick-access-container";
    container.style.cssText = `
        display: inline-flex;
        gap: 6px;
        align-items: center;
        margin-right: 8px;
    `;

    // Color palette for buttons
    const colorMap = {
        blue: {
            bg: "#ddf4ff",
            border: "#54aeff",
            text: "#0969da",
            hover: "#b6e3ff",
        },
        yellow: {
            bg: "#fff8c5",
            border: "#d4a72c",
            text: "#7d4e00",
            hover: "#fae17d",
        },
        green: {
            bg: "#dcffe4",
            border: "#4ac26b",
            text: "#116329",
            hover: "#aceebb",
        },
        purple: {
            bg: "#fbefff",
            border: "#d4a5db",
            text: "#8250df",
            hover: "#f2d8ff",
        },
    };

    // Create buttons for each link
    activeLinks.forEach((link, index) => {
        const displayName = link.name || `#${links.indexOf(link) + 1}`;
        const colorScheme = colorMap[link.color] || colorMap["green"];

        const button = document.createElement("a");
        button.href = link.url;
        button.target = "_blank";
        button.rel = "noopener noreferrer";
        button.className = "btn btn-sm";
        button.style.cssText = `
            display: inline-flex;
            align-items: center;
            height: 32px;
            background: ${colorScheme.bg};
            color: ${colorScheme.text};
            border: 1px solid ${colorScheme.border};
            padding: 5px 12px;
            font-size: 14px;
            text-decoration: none;
            border-radius: 6px;
            white-space: nowrap;
            cursor: pointer;
            transition: background 0.2s ease;
            font-weight: 600;
            text-transform: uppercase;
            line-height: 20px;
        `;
        button.textContent = displayName;
        button.title = `Quick access: ${link.url}`;

        button.addEventListener("mouseenter", () => {
            button.style.background = colorScheme.hover;
        });
        button.addEventListener("mouseleave", () => {
            button.style.background = colorScheme.bg;
        });

        container.appendChild(button);
    });

    // Insert before the search button group
    searchButtonGroup.parentNode.insertBefore(container, searchButtonGroup);

    console.log(
        `GitHub Assistant: Injected ${activeLinks.length} quick access button(s)`,
    );
}

async function init() {
    // Inject quick access buttons on all GitHub pages (except raw)
    await injectQuickAccessButtons();

    const parsedUrl = parseGitHubUrl(location.href);
    if (!parsedUrl) {
        console.log("GitHub Assistant: Could not parse GitHub URL");
        return;
    }

    const { owner, repo } = parsedUrl;

    // Load settings cache if not loaded
    if (cachedSettings === null) {
        await loadSettingsCache();
    }

    // Use cached GitHub token if available, otherwise load from storage
    if (cachedGithubToken === null) {
        await loadGithubTokenCache();
    }

    const githubToken = cachedGithubToken;
    if (!githubToken) {
        console.log("GitHub Assistant: No GitHub token found");
        return;
    }

    try {
        // Fetch user info and repo data in parallel for faster loading
        const [userResp, repoResp] = await Promise.all([
            fetch("https://api.github.com/user", {
                headers: {
                    Accept: "application/vnd.github.v3+json",
                    Authorization: `token ${githubToken}`,
                },
            }),
            fetch(`https://api.github.com/repos/${owner}/${repo}`, {
                headers: {
                    Accept: "application/vnd.github.v3+json",
                    Authorization: `token ${githubToken}`,
                },
            }),
        ]);

        if (!userResp.ok || !repoResp.ok) {
            console.log(
                `GitHub Assistant: API request failed (user: ${userResp.status}, repo: ${repoResp.status})`,
            );
            return;
        }

        const [userData, repoData] = await Promise.all([
            userResp.json(),
            repoResp.json(),
        ]);

        const currentUser = userData.login;

        // Check if current repo is a fork and show "Back to Upstream" button
        if (
            cachedSettings.showForkUpstreamButtons &&
            repoData.fork &&
            repoData.parent
        ) {
            const upstreamUrl = repoData.parent.html_url;
            const upstreamFullName = repoData.parent.full_name;
            addUpstreamButton(upstreamUrl, upstreamFullName);
        }

        // Determine the upstream/source repository for finding user's forks
        let sourceOwner = owner;
        let sourceRepo = repo;

        if (repoData.fork && repoData.source) {
            sourceOwner = repoData.source.owner.login;
            sourceRepo = repoData.source.name;
        }

        // Only show "GitHub Assistant" and import buttons if we're NOT on our own repo
        if (owner !== currentUser) {
            // Find all forks owned by the user
            if (cachedSettings.showForkUpstreamButtons) {
                const forks = await findAllForks(
                    currentUser,
                    sourceOwner,
                    sourceRepo,
                    githubToken,
                );

                if (forks.length > 0) {
                    addForkButton(forks);
                }
            }

            // Show import button for repos not owned by user
            if (cachedSettings.showImportButton) {
                console.log(
                    `GitHub Assistant: Showing import button for ${owner}/${repo}`,
                );
                addImportButton(
                    owner,
                    repo,
                    repoData,
                    currentUser,
                    githubToken,
                );
            }
        } else {
            console.log(
                `GitHub Assistant: Skipping import button (own repo: ${owner}/${repo})`,
            );
        }
    } catch (error) {
        console.error("GitHub Assistant: Error in init():", error);
    }
}

function parseGitHubUrl(url) {
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) return null;

    const owner = match[1];
    const repo = match[2].replace(/[?#].*$/, ""); // Remove query params and hash

    // Exclude special GitHub pages (not actual repositories)
    const excludedOwners = [
        "new",
        "settings",
        "organizations",
        "enterprises",
        "team",
        "orgs",
        "marketplace",
        "explore",
        "topics",
        "trending",
        "collections",
        "events",
        "codespaces",
        "features",
        "sponsors",
        "about",
        "customer-stories",
        "pricing",
        "resources",
        "security",
    ];
    if (excludedOwners.includes(owner.toLowerCase())) {
        return null;
    }

    return {
        owner: owner,
        repo: repo,
    };
}

// Auto-fill import form if we're on the import page
function autofillImportForm() {
    // Check if we're on the import page
    if (!location.pathname.includes("/new/import")) return;

    // Get stored import data
    const importDataStr = sessionStorage.getItem("gh_import_data");
    if (!importDataStr) {
        console.log("GitHub Assistant: No import data found in sessionStorage");
        return;
    }

    const importData = JSON.parse(importDataStr);

    // Check if data is recent (within 30 seconds)
    if (Date.now() - importData.timestamp > 30000) {
        console.log("GitHub Assistant: Import data expired");
        sessionStorage.removeItem("gh_import_data");
        return;
    }

    console.log(
        "GitHub Assistant: Auto-filling import form with data:",
        importData,
    );

    // Add a helpful banner
    const addBanner = () => {
        if (document.getElementById("import-autofill-banner")) return;

        const banner = document.createElement("div");
        banner.id = "import-autofill-banner";
        banner.style.cssText = `
            background: linear-gradient(135deg, #6639ba 0%, #7c52cc 100%);
            color: white;
            padding: 20px 24px;
            border-radius: 8px;
            margin: 24px auto;
            margin-bottom: 300px;
            max-width: 900px;
            font-size: 16px;
            font-weight: 500;
            display: flex;
            align-items: flex-start;
            gap: 16px;
            border: 2px solid #8b5cf6;
            box-shadow: 0 4px 12px rgba(102, 57, 186, 0.3);
        `;

        banner.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink: 0; margin-top: 2px;">
                <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path>
            </svg>
            <div style="flex: 1;">
                <div style="font-size: 15px; line-height: 1.6; margin-bottom: ${
                    importData.private ? "12px" : "0"
                };">
                    Please set the repository owner, name and visibility<br/>
                </div>
                ${
                    importData.private
                        ? '<div style="font-size: 17px; line-height: 1.5; background: rgba(255, 215, 0, 0.15); padding: 10px 12px; border-radius: 6px; border-left: 3px solid #ffd700;"><strong style="color: #ffd700;">⚠️ PRIVATE REPOSITORY AHEAD:</strong> You must enter your GitHub username and Personal Access Token below to import this private repository!</div>'
                        : ""
                }
            </div>
        `;

        // Find the button container and insert banner right after it
        const buttonContainer =
            document.querySelector(
                '[data-direction="horizontal"][data-justify="end"]',
            ) ||
            document
                .querySelector('button[type="submit"]')
                ?.closest('[data-direction="horizontal"]');

        if (buttonContainer) {
            // Insert right after the button container
            buttonContainer.parentNode.insertBefore(
                banner,
                buttonContainer.nextSibling,
            );
        } else {
            // Fallback: append to content area
            const contentArea =
                document.querySelector("main") ||
                document.querySelector('[role="main"]') ||
                document.querySelector(".application-main") ||
                document.querySelector("body");

            if (contentArea) {
                contentArea.appendChild(banner);
            } else {
                document.body.appendChild(banner);
            }
        }

        // Copy URL to clipboard
        navigator.clipboard.writeText(importData.url).catch(() => {});
    };

    // Show banner immediately
    addBanner();

    // Wait for form to load and fill it
    const fillForm = () => {
        let filled = false;

        // Find all input fields for debugging
        const allInputs = document.querySelectorAll(
            'input[type="text"], input[type="url"], input:not([type])',
        );
        console.log(
            "GitHub Assistant: Found input fields:",
            Array.from(allInputs).map((i) => ({
                name: i.name,
                id: i.id,
                type: i.type,
                placeholder: i.placeholder,
            })),
        );

        // Fill the clone URL field - try multiple selectors
        const urlInput =
            document.querySelector('input[name="vcs_url"]') ||
            document.querySelector("input#vcs_url") ||
            document.querySelector('input[name="import_url"]') ||
            document.querySelector('input[type="url"]') ||
            document.querySelector('input[placeholder*="Clone URL"]') ||
            document.querySelector('input[placeholder*="repository"]') ||
            document.querySelector('input[placeholder*="https://"]') ||
            Array.from(allInputs).find((input) => {
                const label = input.labels?.[0]?.textContent || "";
                const placeholder = input.placeholder || "";
                const ariaLabel = input.getAttribute("aria-label") || "";
                return (
                    label.toLowerCase().includes("url") ||
                    label.toLowerCase().includes("clone") ||
                    placeholder.toLowerCase().includes("url") ||
                    ariaLabel.toLowerCase().includes("url")
                );
            });

        if (urlInput) {
            console.log("GitHub Assistant: Found URL input:", urlInput);
            // Use native setter to bypass React
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value",
            ).set;
            nativeInputValueSetter.call(urlInput, importData.url);

            urlInput.dispatchEvent(new Event("input", { bubbles: true }));
            urlInput.dispatchEvent(new Event("change", { bubbles: true }));
            urlInput.dispatchEvent(new Event("blur", { bubbles: true }));
            urlInput.focus();
            filled = true;
        } else {
            console.log("GitHub Assistant: URL input not found");
        }

        // Fill repository name
        const nameInput =
            document.querySelector('input[name="repository_name"]') ||
            document.querySelector("input#repository_name") ||
            document.querySelector('input[name="name"]');

        if (nameInput) {
            console.log("GitHub Assistant: Found name input:", nameInput);
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLInputElement.prototype,
                "value",
            ).set;
            nativeInputValueSetter.call(nameInput, importData.name);

            nameInput.dispatchEvent(new Event("input", { bubbles: true }));
            nameInput.dispatchEvent(new Event("change", { bubbles: true }));
            nameInput.dispatchEvent(new Event("blur", { bubbles: true }));
            filled = true;
        } else {
            console.log("GitHub Assistant: Name input not found");
        }

        // Fill credentials for private repos
        if (importData.private) {
            const usernameInput =
                document.querySelector('input[name="vcs_username"]') ||
                document.querySelector("input#vcs_username") ||
                document.querySelector('input[placeholder*="username"]');

            if (usernameInput) {
                console.log("GitHub Assistant: Found username input");
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value",
                ).set;
                nativeInputValueSetter.call(usernameInput, importData.username);
                usernameInput.dispatchEvent(
                    new Event("input", { bubbles: true }),
                );
                usernameInput.dispatchEvent(
                    new Event("change", { bubbles: true }),
                );
                usernameInput.dispatchEvent(
                    new Event("blur", { bubbles: true }),
                );
            }

            const passwordInput =
                document.querySelector('input[name="vcs_password"]') ||
                document.querySelector("input#vcs_password") ||
                document.querySelector('input[type="password"]');

            if (passwordInput) {
                console.log("GitHub Assistant: Found password input");
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    "value",
                ).set;
                nativeInputValueSetter.call(passwordInput, importData.token);
                passwordInput.dispatchEvent(
                    new Event("input", { bubbles: true }),
                );
                passwordInput.dispatchEvent(
                    new Event("change", { bubbles: true }),
                );
                passwordInput.dispatchEvent(
                    new Event("blur", { bubbles: true }),
                );
            }
        }

        if (filled) {
            console.log("GitHub Assistant: Form filled successfully");
            // Clear after successful fill
            sessionStorage.removeItem("gh_import_data");
            return true;
        }
        return false;
    };

    // Try to fill immediately
    if (fillForm()) return;

    // Try again after delays
    setTimeout(() => fillForm(), 300);
    setTimeout(() => fillForm(), 800);
    setTimeout(() => fillForm(), 1500);
    setTimeout(() => fillForm(), 3000);

    // Also watch for DOM changes
    const observer = new MutationObserver(() => {
        if (fillForm()) {
            observer.disconnect();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    // Stop observing after 5 seconds
    setTimeout(() => observer.disconnect(), 5000);
}

// Initialize on page load
// ===== RAW PAGE HANDLERS =====

/**
 * Parse gist raw URL and return the gist page URL with file anchor
 * Example: https://gist.githubusercontent.com/erbanku/cd468880461ddcce95e44da10b921262/raw/51ddada9e85be5b27426bcac66e80dab01815541/dify_workflows_export_EN.js
 * Returns: https://gist.github.com/erbanku/cd468880461ddcce95e44da10b921262#file-dify_workflows_export_en-js
 */
function parseGistRawUrl(url) {
    const match = url.match(
        /gist\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/raw\/[^\/]+\/(.+)$/,
    );
    if (!match) return null;

    const username = match[1];
    const gistId = match[2];
    const filename = match[3];

    // Convert filename to gist anchor format
    // GitHub converts filenames to lowercase and replaces dots with hyphens (except extension dot becomes -)
    const anchor = "file-" + filename.toLowerCase().replace(/\./g, "-");

    return `https://gist.github.com/${username}/${gistId}#${anchor}`;
}

/**
 * Parse repo raw URL and return the file view URL
 * Example: https://raw.githubusercontent.com/owner/repo/branch/path/to/file.js
 * Returns: https://github.com/owner/repo/blob/branch/path/to/file.js
 */
function parseRepoRawUrl(url) {
    const match = url.match(
        /raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)/,
    );
    if (!match) return null;

    const owner = match[1];
    const repo = match[2];
    const branch = match[3];
    const filePath = match[4];

    return `https://github.com/${owner}/${repo}/blob/${branch}/${filePath}`;
}

/**
 * Add a "Go to Gist/File" button in the upper right corner of raw pages
 */
function addRawPageButton(targetUrl, buttonText) {
    // Remove existing button if present
    document.getElementById("go-to-source-container")?.remove();

    const container = document.createElement("div");
    container.id = "go-to-source-container";
    container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        display: flex;
        gap: 8px;
    `;

    // Go to Gist/File button
    const button = document.createElement("button");
    button.style.cssText = `
        padding: 8px 16px;
        background-color: #238636;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
        transition: background-color 0.2s;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    `;

    button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm9.78-2.22-5.5 5.5a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l5.5-5.5a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"></path>
        </svg>
        ${buttonText}
    `;

    button.title = `Navigate to ${buttonText.toLowerCase()}`;

    button.addEventListener("mouseover", () => {
        button.style.backgroundColor = "#2ea043";
    });
    button.addEventListener("mouseout", () => {
        button.style.backgroundColor = "#238636";
    });

    button.addEventListener("click", () => {
        window.location.href = targetUrl;
    });

    // Copy All button
    const copyButton = document.createElement("button");
    copyButton.style.cssText = `
        padding: 8px 16px;
        background-color: #0969da;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
        transition: background-color 0.2s;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    `;

    copyButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"></path>
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"></path>
        </svg>
        Copy All
    `;

    copyButton.title = "Copy all content to clipboard";

    copyButton.addEventListener("mouseover", () => {
        copyButton.style.backgroundColor = "#0860ca";
    });
    copyButton.addEventListener("mouseout", () => {
        copyButton.style.backgroundColor = "#0969da";
    });

    copyButton.addEventListener("click", async () => {
        try {
            // Get the main content (usually <pre> on raw pages)
            const preElement = document.querySelector("pre");
            const content = (
                preElement
                    ? preElement.innerText || preElement.textContent
                    : document.body.innerText || document.body.textContent
            ).trim();

            await navigator.clipboard.writeText(content);

            // Visual feedback - change button temporarily
            const originalHTML = copyButton.innerHTML;
            copyButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"></path>
                </svg>
                Copied!
            `;
            copyButton.style.backgroundColor = "#1a7f37";

            setTimeout(() => {
                copyButton.innerHTML = originalHTML;
                copyButton.style.backgroundColor = "#0969da";
            }, 2000);
        } catch (err) {
            console.error("GitHub Assistant: Failed to copy content:", err);

            // Show error feedback
            const originalHTML = copyButton.innerHTML;
            copyButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M2.343 13.657A8 8 0 1 1 13.657 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z"></path>
                </svg>
                Failed
            `;
            copyButton.style.backgroundColor = "#cf222e";

            setTimeout(() => {
                copyButton.innerHTML = originalHTML;
                copyButton.style.backgroundColor = "#0969da";
            }, 2000);
        }
    });

    container.appendChild(button);
    container.appendChild(copyButton);
    document.body.appendChild(container);
}

/**
 * Check if the current page contains JSON content and format it
 */
function formatJSONContent() {
    try {
        // Get the main content element
        const preElement = document.querySelector("pre");
        if (!preElement) {
            return false;
        }

        // Get the raw text content
        const rawContent = (
            preElement.innerText || preElement.textContent
        ).trim();

        // Check if it's valid JSON
        try {
            const jsonData = JSON.parse(rawContent);

            // Store original content for toggling
            if (!preElement.dataset.originalContent) {
                preElement.dataset.originalContent = rawContent;
                preElement.dataset.isFormatted = "false";
            }

            // Format JSON with 2-space indentation
            const formattedJSON = JSON.stringify(jsonData, null, 2);

            // Apply formatted content
            preElement.textContent = formattedJSON;
            preElement.dataset.isFormatted = "true";

            // Add styling for better readability
            preElement.style.whiteSpace = "pre";
            preElement.style.fontFamily = "monospace";
            preElement.style.fontSize = "14px";
            preElement.style.lineHeight = "1.5";

            console.log(
                "GitHub Assistant: JSON content formatted successfully",
            );
            return true;
        } catch (parseError) {
            // Not valid JSON or already formatted
            return false;
        }
    } catch (error) {
        console.error("GitHub Assistant: Error formatting JSON:", error);
        return false;
    }
}

/**
 * Toggle between formatted and original JSON
 */
function toggleJSONFormat() {
    const preElement = document.querySelector("pre");
    if (!preElement || !preElement.dataset.originalContent) {
        return;
    }

    const isFormatted = preElement.dataset.isFormatted === "true";

    if (isFormatted) {
        // Show original
        preElement.textContent = preElement.dataset.originalContent;
        preElement.dataset.isFormatted = "false";
    } else {
        // Show formatted
        try {
            const jsonData = JSON.parse(preElement.dataset.originalContent);
            preElement.textContent = JSON.stringify(jsonData, null, 2);
            preElement.dataset.isFormatted = "true";
        } catch (error) {
            console.error(
                "GitHub Assistant: Error toggling JSON format:",
                error,
            );
        }
    }
}

/**
 * Add format toggle button for JSON files
 */
function addFormatToggleButton() {
    const preElement = document.querySelector("pre");
    if (!preElement || !preElement.dataset.originalContent) {
        return;
    }

    const container = document.getElementById("go-to-source-container");
    if (!container) {
        return;
    }

    // Check if button already exists
    if (document.getElementById("format-json-button")) {
        return;
    }

    const formatButton = document.createElement("button");
    formatButton.id = "format-json-button";
    formatButton.style.cssText = `
        padding: 8px 16px;
        background-color: #8250df;
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24);
        transition: background-color 0.2s;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    `;

    formatButton.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25ZM3.5 6.25a.75.75 0 0 1 .75-.75h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1-.75-.75Zm.75 2.25h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1 0-1.5Z"></path>
        </svg>
        Toggle Format
    `;

    formatButton.title = "Toggle between formatted and original JSON";

    formatButton.addEventListener("mouseover", () => {
        formatButton.style.backgroundColor = "#7c52cc";
    });
    formatButton.addEventListener("mouseout", () => {
        formatButton.style.backgroundColor = "#8250df";
    });

    formatButton.addEventListener("click", () => {
        toggleJSONFormat();

        // Update button text based on current state
        const preElement = document.querySelector("pre");
        const isFormatted = preElement?.dataset.isFormatted === "true";

        if (isFormatted) {
            formatButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25ZM3.5 6.25a.75.75 0 0 1 .75-.75h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1-.75-.75Zm.75 2.25h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1 0-1.5Z"></path>
                </svg>
                Toggle Format
            `;
        } else {
            formatButton.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M0 3.75C0 2.784.784 2 1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25Zm1.75-.25a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25ZM3.5 6.25a.75.75 0 0 1 .75-.75h7a.75.75 0 0 1 0 1.5h-7a.75.75 0 0 1-.75-.75Zm.75 2.25h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1 0-1.5Z"></path>
                </svg>
                Toggle Format
            `;
        }
    });

    // Insert the format button before the copy button (as second button)
    const copyButton = container.querySelector("button:nth-child(2)");
    if (copyButton) {
        container.insertBefore(formatButton, copyButton);
    } else {
        container.appendChild(formatButton);
    }
}

/**
 * Initialize raw page handler - detects if we're on a raw page and adds appropriate button
 */
async function initRawPage() {
    // Load settings if not loaded
    if (cachedSettings === null) {
        await loadSettingsCache();
    }

    // Check if raw page buttons are enabled
    if (!cachedSettings.showRawPageButtons) {
        return;
    }

    const currentUrl = location.href;

    // Check if we're on a gist raw page
    if (currentUrl.includes("gist.githubusercontent.com")) {
        const gistUrl = parseGistRawUrl(currentUrl);
        if (gistUrl) {
            console.log(
                "GitHub Assistant: Detected gist raw page, adding button",
            );
            addRawPageButton(gistUrl, "Go to Gist");

            // Try to format JSON content
            const isJSON = formatJSONContent();
            if (isJSON) {
                addFormatToggleButton();
            }
        }
        return;
    }

    // Check if we're on a repo raw page
    if (currentUrl.includes("raw.githubusercontent.com")) {
        const fileUrl = parseRepoRawUrl(currentUrl);
        if (fileUrl) {
            console.log(
                "GitHub Assistant: Detected repo raw page, adding button",
            );
            addRawPageButton(fileUrl, "Go to File");

            // Try to format JSON content
            const isJSON = formatJSONContent();
            if (isJSON) {
                addFormatToggleButton();
            }
        }
        return;
    }
}

// ===== END RAW PAGE HANDLERS =====

init();
autofillImportForm();
initRawPage();

// Handle GitHub's SPA navigation with better detection
let lastUrl = location.href;

// Use both pushState/replaceState interception and MutationObserver
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

function handleNavigation() {
    const url = location.href;
    if (url !== lastUrl) {
        console.log(
            `GitHub Assistant: Navigation detected from ${lastUrl} to ${url}`,
        );
        lastUrl = url;

        // Remove existing buttons before reinitializing
        document.getElementById("go-to-fork-container")?.remove();
        document.getElementById("back-to-upstream-container")?.remove();
        document.getElementById("import-repo-container")?.remove();
        document.getElementById("github-assistant-quick-access")?.remove();

        // Reinitialize immediately with minimal delay
        setTimeout(async () => {
            console.log("GitHub Assistant: Reinitializing after navigation...");
            await init();
            autofillImportForm();
        }, 50);
    }
}

history.pushState = function (...args) {
    originalPushState.apply(this, args);
    handleNavigation();
};

history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    handleNavigation();
};

// Also listen for popstate (back/forward buttons)
window.addEventListener("popstate", handleNavigation);

// Fallback MutationObserver for any missed navigations
let mutationTimeout;
new MutationObserver(() => {
    clearTimeout(mutationTimeout);
    mutationTimeout = setTimeout(handleNavigation, 100);
}).observe(document, { subtree: true, childList: true });

async function findAllForks(currentUser, sourceOwner, sourceRepo, githubToken) {
    const forks = [];
    const userOrgs = new Set();
    userOrgs.add(currentUser);

    console.log(
        `GitHub Assistant: Searching forks for ${sourceOwner}/${sourceRepo}`,
    );

    // Get user's organizations
    try {
        const orgsResp = await fetch(
            "https://api.github.com/user/orgs?per_page=100",
            {
                headers: {
                    Accept: "application/vnd.github.v3+json",
                    Authorization: `token ${githubToken}`,
                },
            },
        );

        if (orgsResp.ok) {
            const orgs = await orgsResp.json();
            orgs.forEach((org) => userOrgs.add(org.login));
        }
    } catch (e) {
        console.log("GitHub Assistant: Could not fetch organizations:", e);
    }

    // Use the GitHub forks API to get all forks of the source repo
    try {
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const forksResp = await fetch(
                `https://api.github.com/repos/${sourceOwner}/${sourceRepo}/forks?per_page=100&page=${page}`,
                {
                    headers: {
                        Accept: "application/vnd.github.v3+json",
                        Authorization: `token ${githubToken}`,
                    },
                },
            );

            if (!forksResp.ok) {
                console.log(
                    `GitHub Assistant: Failed to fetch forks (status ${forksResp.status})`,
                );
                break;
            }

            const allForks = await forksResp.json();

            if (allForks.length === 0) {
                hasMore = false;
                break;
            }

            // Filter forks that belong to the user or their organizations
            for (const fork of allForks) {
                if (userOrgs.has(fork.owner.login)) {
                    forks.push({
                        owner: fork.owner.login,
                        name: fork.name,
                        url: fork.html_url,
                    });
                }
            }

            // If we found forks, we can stop early
            if (forks.length > 0) break;

            page++;
            if (allForks.length < 100) hasMore = false;
        }
    } catch (e) {
        console.log("GitHub Assistant: Could not fetch forks:", e);
    }

    if (forks.length > 0) {
        console.log(`GitHub Assistant: Found ${forks.length} fork(s)`);
    }
    return forks;
}

function addForkButton(forks) {
    // Prevent duplicate buttons
    if (document.getElementById("go-to-fork-container")) return;

    // Find the search button group in the top navigation
    const searchButtonGroup =
        document.querySelector(".Search-module__searchButtonGroup--L3A4O") ||
        document.querySelector('[data-testid="top-nav-center"]');

    if (!searchButtonGroup) {
        console.log(
            "GitHub Assistant: Could not find search button group for fork button",
        );
        return;
    }

    const container = createForkButtonContainer(forks);

    // Add with some margin to separate from search box
    container.style.marginRight = "8px";
    container.style.display = "inline-block";

    // Insert before the search button group
    searchButtonGroup.parentNode.insertBefore(container, searchButtonGroup);
    console.log("GitHub Assistant: Fork button added successfully");
}

function createForkButtonContainer(forks) {
    const container = document.createElement("div");
    container.id = "go-to-fork-container";
    container.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 0;
    position: relative;
    margin-right: 4px;
    vertical-align: middle;
  `;

    if (forks.length === 1) {
        // Single fork - just a button
        const button = document.createElement("a");
        button.href = forks[0].url;
        button.className = "btn btn-sm";
        button.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      height: 32px;
      background-color: #238636;
      color: white !important;
      border: 1px solid rgba(27, 31, 36, 0.15);
      border-radius: 6px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      line-height: 20px;
    `;
        button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"></path>
      </svg>
      Go to Fork
    `;
        button.addEventListener("mouseover", () => {
            button.style.backgroundColor = "#2ea043";
        });
        button.addEventListener("mouseout", () => {
            button.style.backgroundColor = "#238636";
        });
        container.appendChild(button);
    } else {
        // Multiple forks - button with dropdown
        const wrapper = document.createElement("div");
        wrapper.style.cssText = `
      position: relative;
      display: inline-flex;
    `;

        const mainBtn = document.createElement("a");
        mainBtn.href = forks[0].url;
        mainBtn.className = "btn btn-sm";
        mainBtn.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      height: 32px;
      background-color: #238636;
      color: white !important;
      border: 1px solid rgba(27, 31, 36, 0.15);
      border-radius: 6px 0 0 6px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      line-height: 20px;
    `;
        mainBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"></path>
      </svg>
      GitHub Assistant
    `;

        const dropBtn = document.createElement("button");
        dropBtn.type = "button";
        dropBtn.className = "btn btn-sm";
        dropBtn.style.cssText = `
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 5px 8px;
      height: 32px;
      background-color: #238636;
      color: white;
      border: 1px solid rgba(27, 31, 36, 0.15);
      border-left: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 0 6px 6px 0;
      cursor: pointer;
      font-size: 12px;
      line-height: 20px;
    `;
        dropBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
        <path d="M4.427 7.427l3.396 3.396a.25.25 0 00.354 0l3.396-3.396A.25.25 0 0011.396 7H4.604a.25.25 0 00-.177.427z"></path>
      </svg>
    `;

        const dropdown = document.createElement("div");
        dropdown.style.cssText = `
      display: none;
      position: absolute;
      top: calc(100% + 4px);
      right: 0;
      background: #ffffff;
      border: 1px solid #d0d7de;
      border-radius: 6px;
      min-width: 200px;
      box-shadow: 0 8px 24px rgba(140, 149, 159, 0.2);
      z-index: 1000;
      overflow: hidden;
    `;

        forks.forEach((fork, index) => {
            const item = document.createElement("a");
            item.href = fork.url;
            item.style.cssText = `
        display: block;
        padding: 8px 12px;
        color: #24292f;
        text-decoration: none;
        font-size: 13px;
        border-bottom: ${
            index < forks.length - 1 ? "1px solid #d0d7de" : "none"
        };
        transition: background-color 0.1s;
      `;
            item.innerHTML = `
        <div style="font-weight: 500;">${fork.owner}/${fork.name}</div>
      `;
            item.addEventListener("mouseover", () => {
                item.style.backgroundColor = "#f6f8fa";
            });
            item.addEventListener("mouseout", () => {
                item.style.backgroundColor = "transparent";
            });
            dropdown.appendChild(item);
        });

        let isOpen = false;
        const toggleDropdown = (e) => {
            e?.preventDefault();
            e?.stopPropagation();
            isOpen = !isOpen;
            dropdown.style.display = isOpen ? "block" : "none";
        };

        dropBtn.addEventListener("click", toggleDropdown);

        mainBtn.addEventListener("mouseover", () => {
            mainBtn.style.backgroundColor = "#2ea043";
        });
        mainBtn.addEventListener("mouseout", () => {
            mainBtn.style.backgroundColor = "#238636";
        });

        dropBtn.addEventListener("mouseover", () => {
            dropBtn.style.backgroundColor = "#2ea043";
        });
        dropBtn.addEventListener("mouseout", () => {
            dropBtn.style.backgroundColor = "#238636";
        });

        document.addEventListener("click", (e) => {
            if (!wrapper.contains(e.target)) {
                isOpen = false;
                dropdown.style.display = "none";
            }
        });

        wrapper.appendChild(mainBtn);
        wrapper.appendChild(dropBtn);
        wrapper.appendChild(dropdown);
        container.appendChild(wrapper);
    }

    return container;
}

function addUpstreamButton(upstreamUrl, upstreamFullName) {
    // Prevent duplicate buttons
    if (document.getElementById("back-to-upstream-container")) return;

    // Find the search button group in the top navigation
    const searchButtonGroup =
        document.querySelector(".Search-module__searchButtonGroup--L3A4O") ||
        document.querySelector('[data-testid="top-nav-center"]');

    if (!searchButtonGroup) {
        console.log(
            "GitHub Assistant: Could not find search button group for upstream button",
        );
        return;
    }

    const container = createUpstreamButtonContainer(
        upstreamUrl,
        upstreamFullName,
    );

    container.style.marginRight = "8px";
    container.style.display = "inline-block";

    // Insert before the search button group
    searchButtonGroup.parentNode.insertBefore(container, searchButtonGroup);
    console.log("GitHub Assistant: Upstream button added successfully");
}

function createUpstreamButtonContainer(upstreamUrl, upstreamFullName) {
    const container = document.createElement("div");
    container.id = "back-to-upstream-container";
    container.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 0;
    position: relative;
    margin-right: 4px;
    vertical-align: middle;
  `;

    const button = document.createElement("a");
    button.href = upstreamUrl;
    button.className = "btn btn-sm";
    button.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      height: 32px;
      background-color: #0969da;
      color: white !important;
      border: 1px solid rgba(27, 31, 36, 0.15);
      border-radius: 6px;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      line-height: 20px;
    `;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm9.78-2.22-5.5 5.5a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l5.5-5.5a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"></path>
      </svg>
      Back to Upstream
    `;
    button.title = `Go to upstream: ${upstreamFullName}`;
    button.addEventListener("mouseover", () => {
        button.style.backgroundColor = "#0860ca";
    });
    button.addEventListener("mouseout", () => {
        button.style.backgroundColor = "#0969da";
    });
    container.appendChild(button);

    return container;
}

// ===============================================
// Import Repository Functionality
// ===============================================

function addImportButton(owner, repo, repoData, currentUser, githubToken) {
    // Prevent duplicate buttons
    if (document.getElementById("import-repo-container")) return;

    // Find the search button group in the top navigation
    const searchButtonGroup =
        document.querySelector(".Search-module__searchButtonGroup--L3A4O") ||
        document.querySelector('[data-testid="top-nav-center"]');

    if (!searchButtonGroup) {
        console.log(
            "GitHub Assistant: Could not find search button group for import button",
        );
        return;
    }

    const container = createImportButtonContainer(
        owner,
        repo,
        repoData,
        currentUser,
        githubToken,
    );

    container.style.marginRight = "8px";
    container.style.display = "inline-block";

    // Insert before the search button group
    searchButtonGroup.parentNode.insertBefore(container, searchButtonGroup);
    console.log("GitHub Assistant: Import button added successfully");
}

function createImportButtonContainer(
    owner,
    repo,
    repoData,
    currentUser,
    githubToken,
) {
    const container = document.createElement("div");
    container.id = "import-repo-container";
    container.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 0;
        position: relative;
        margin-right: 4px;
        vertical-align: middle;
    `;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-sm";
    button.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        height: 32px;
        background-color: #6639ba;
        color: white !important;
        border: 1px solid rgba(27, 31, 36, 0.15);
        border-radius: 6px;
        text-decoration: none;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        line-height: 20px;
    `;

    button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M1 2.5A2.5 2.5 0 0 1 3.5 0h8.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V1.5h-8a1 1 0 0 0-1 1v6.708A2.493 2.493 0 0 1 3.5 9h3.25a.75.75 0 0 1 0 1.5H3.5a1 1 0 0 0 0 2h5.75a.75.75 0 0 1 0 1.5H3.5A2.5 2.5 0 0 1 1 11.5Zm13.23 7.79h-.001l-1.224-1.224v6.184a.75.75 0 0 1-1.5 0V9.066L10.28 10.29a.75.75 0 0 1-1.06-1.061l2.505-2.504a.75.75 0 0 1 1.06 0L15.29 9.23a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018Z"></path>
        </svg>
        Import Repository
    `;

    button.title = `Import ${owner}/${repo} to your account`;

    button.addEventListener("mouseover", () => {
        button.style.backgroundColor = "#7c52cc";
    });
    button.addEventListener("mouseout", () => {
        button.style.backgroundColor = "#6639ba";
    });

    button.addEventListener("click", () => {
        handleImportRepo(owner, repo, repoData, currentUser, githubToken);
    });

    container.appendChild(button);
    return container;
}
