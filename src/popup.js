// DOM elements
const setupView = document.getElementById("setup-view");
const configuredView = document.getElementById("configured-view");
const tokenInput = document.getElementById("token");
const saveBtn = document.getElementById("save-btn");
const changeTokenBtn = document.getElementById("change-token-btn");
const removeTokenBtn = document.getElementById("remove-token-btn");
const statusDiv = document.getElementById("status");
const quickLinksContainer = document.getElementById("quick-links-container");
const configuredLinksContainer = document.getElementById(
    "configured-links-container"
);
const editLinksBtn = document.getElementById("edit-links-btn");
const toggleTokenBtn = document.getElementById("toggle-token");
const toggleDisplayTokenBtn = document.getElementById("toggle-display-token");
const copyTokenBtn = document.getElementById("copy-token-btn");
const displayTokenSpan = document.getElementById("display-token");
const formViewBtn = document.getElementById("form-view-btn");
const jsonViewBtn = document.getElementById("json-view-btn");
const formViewContainer = document.getElementById("form-view-container");
const jsonViewContainer = document.getElementById("json-view-container");
const jsonEditor = document.getElementById("json-editor");
const jsonError = document.getElementById("json-error");
const jsonLineNumbers = document.getElementById("json-line-numbers");
const resetLinksBtn = document.getElementById("reset-links-btn");

// Settings checkboxes
const setupImportBtn = document.getElementById("setup-setting-import-btn");
const setupQuickLinks = document.getElementById("setup-setting-quick-links");
const setupForkUpstream = document.getElementById(
    "setup-setting-fork-upstream"
);
const setupRawPage = document.getElementById("setup-setting-raw-page");
const setupHotkeys = document.getElementById("setup-setting-hotkeys");
const configImportBtn = document.getElementById("setting-import-btn");
const configQuickLinks = document.getElementById("setting-quick-links");
const configForkUpstream = document.getElementById("setting-fork-upstream");
const configRawPage = document.getElementById("setting-raw-page");
const configHotkeys = document.getElementById("setting-hotkeys");
const editHotkeysBtn = document.getElementById("edit-hotkeys-btn");
const hotkeyEditorDiv = document.getElementById("hotkeys-editor");
const hotkeysList = document.getElementById("hotkeys-list");
const saveHotkeysBtn = document.getElementById("save-hotkeys-btn");
const cancelHotkeysBtn = document.getElementById("cancel-hotkeys-btn");

let savedToken = "";
let currentView = "form";

// Reset links by fetching organizations again
resetLinksBtn.addEventListener("click", async () => {
    if (!savedToken) {
        showStatus(
            "No GitHub token found. Please configure your token first.",
            "error"
        );
        return;
    }

    resetLinksBtn.textContent = "Fetching...";
    resetLinksBtn.disabled = true;

    try {
        const orgsResponse = await fetch("https://api.github.com/user/orgs", {
            headers: {
                Authorization: `token ${savedToken}`,
                Accept: "application/vnd.github.v3+json",
            },
        });

        if (orgsResponse.ok) {
            const orgs = await orgsResponse.json();
            const defaultColors = [
                "green",
                "yellow",
                "blue",
                "purple",
                "green",
            ];
            const newLinks = orgs.slice(0, 5).map((org, idx) => ({
                name: org.login,
                link_num: `LINK ${idx + 1}`,
                url: `https://github.com/${org.login}`,
                color: defaultColors[idx],
            }));

            // Save and update UI
            chrome.storage.sync.set({ quickAccessLinks: newLinks }, () => {
                initQuickLinks(newLinks);
                jsonEditor.value = JSON.stringify(newLinks, null, 2);
                updateJsonLineNumbers();
                showStatus(
                    `✓ Reset to ${newLinks.length} organization link(s)!`,
                    "success"
                );
                setTimeout(() => {
                    statusDiv.style.display = "none";
                }, 2000);
            });
        } else {
            showStatus(
                "Failed to fetch organizations. Check your token permissions.",
                "error"
            );
        }
    } catch (err) {
        console.error("Error fetching organizations:", err);
        showStatus("Network error. Please try again.", "error");
    } finally {
        resetLinksBtn.textContent = "Reset to Org Links";
        resetLinksBtn.disabled = false;
    }
});

// Update JSON line numbers with Link labels
function updateJsonLineNumbers() {
    const lines = jsonEditor.value.split("\n");
    let lineNumbers = "";
    let linkIndex = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Detect start of a new object
        if (line.startsWith("{")) {
            lineNumbers += `<div>Link ${linkIndex + 1}</div>`;
            linkIndex++;
        } else {
            lineNumbers += "<div></div>";
        }
    }

    jsonLineNumbers.innerHTML = lineNumbers;
}

// Sync JSON editor scroll with line numbers
jsonEditor.addEventListener("scroll", () => {
    jsonLineNumbers.scrollTop = jsonEditor.scrollTop;
});

// Update line numbers when JSON changes
jsonEditor.addEventListener("input", () => {
    updateJsonLineNumbers();
});

// Toggle between form and JSON view
formViewBtn.addEventListener("click", () => {
    currentView = "form";
    formViewBtn.classList.add("active");
    jsonViewBtn.classList.remove("active");
    formViewContainer.classList.remove("hidden");
    jsonViewContainer.classList.remove("active");
    jsonError.classList.remove("show");

    // Sync from JSON to form if there are changes
    try {
        const jsonData = JSON.parse(jsonEditor.value || "[]");
        initQuickLinks(jsonData);
    } catch (e) {
        // Keep existing form data if JSON is invalid
    }
});

jsonViewBtn.addEventListener("click", () => {
    currentView = "json";
    jsonViewBtn.classList.add("active");
    formViewBtn.classList.remove("active");
    formViewContainer.classList.add("hidden");
    jsonViewContainer.classList.add("active");
    jsonError.classList.remove("show");

    // Sync from form to JSON
    const links = collectQuickLinks();
    jsonEditor.value = JSON.stringify(links, null, 2);
    updateJsonLineNumbers();
});

// Validate and auto-save JSON
jsonEditor.addEventListener(
    "input",
    debounce(() => {
        try {
            const data = JSON.parse(jsonEditor.value || "[]");

            // Validate structure
            if (!Array.isArray(data)) {
                throw new Error("JSON must be an array");
            }

            // Validate URLs
            for (const item of data) {
                if (item.url && !isValidGitHubUrl(item.url)) {
                    throw new Error(`Invalid GitHub URL: ${item.url}`);
                }
            }

            // Limit to 5 items
            const limitedData = data.slice(0, 5);

            // Save if valid
            chrome.storage.sync.set({ quickAccessLinks: limitedData }, () => {
                console.log("Quick links saved from JSON");
                jsonError.classList.remove("show");
            });
        } catch (e) {
            jsonError.textContent = `Invalid JSON: ${e.message}`;
            jsonError.classList.add("show");
        }
    }, 1000)
);

// Copy token to clipboard
copyTokenBtn.addEventListener("click", async () => {
    try {
        await navigator.clipboard.writeText(savedToken);
        copyTokenBtn.classList.add("copied");
        const originalTitle = copyTokenBtn.title;
        copyTokenBtn.title = "Copied!";

        setTimeout(() => {
            copyTokenBtn.classList.remove("copied");
            copyTokenBtn.title = originalTitle;
        }, 2000);
    } catch (err) {
        console.error("Failed to copy token:", err);
    }
});

// Toggle password visibility in setup view
toggleTokenBtn.addEventListener("click", () => {
    const isPassword = tokenInput.type === "password";
    tokenInput.type = isPassword ? "text" : "password";
    document.getElementById("eye-icon").style.display = isPassword
        ? "none"
        : "block";
    document.getElementById("eye-slash-icon").style.display = isPassword
        ? "block"
        : "none";
});

// Toggle token visibility in configured view
toggleDisplayTokenBtn.addEventListener("click", () => {
    const isHidden = displayTokenSpan.textContent.startsWith("••");
    if (isHidden) {
        displayTokenSpan.textContent = savedToken;
        document.getElementById("eye-icon-display").style.display = "none";
        document.getElementById("eye-slash-icon-display").style.display =
            "block";
    } else {
        displayTokenSpan.textContent = "••••••••••••••••••••";
        document.getElementById("eye-icon-display").style.display = "block";
        document.getElementById("eye-slash-icon-display").style.display =
            "none";
    }
});

// Color palette options
const colorOptions = [
    {
        name: "Blue",
        value: "blue",
        bg: "#ddf4ff",
        border: "#54aeff",
        text: "#0969da",
        hover: "#b6e3ff",
    },
    {
        name: "Yellow",
        value: "yellow",
        bg: "#fff8c5",
        border: "#d4a72c",
        text: "#7d4e00",
        hover: "#fae17d",
    },
    {
        name: "Green",
        value: "green",
        bg: "#dcffe4",
        border: "#4ac26b",
        text: "#116329",
        hover: "#aceebb",
    },
    {
        name: "Purple",
        value: "purple",
        bg: "#fbefff",
        border: "#d4a5db",
        text: "#8250df",
        hover: "#f2d8ff",
    },
];

// Initialize quick links inputs
function initQuickLinks(links = []) {
    quickLinksContainer.innerHTML = "";
    const defaultColors = ["green", "yellow", "blue", "purple", "green"];

    for (let i = 0; i < 5; i++) {
        const link = links[i] || { name: "", url: "", color: defaultColors[i] };
        const linkItem = document.createElement("div");
        linkItem.className = "quick-link-item";

        const colorOptionsHtml = colorOptions
            .map(
                (opt) =>
                    `<option value="${opt.value}" ${
                        (link.color || defaultColors[i]) === opt.value
                            ? "selected"
                            : ""
                    }>${opt.name}</option>`
            )
            .join("");

        linkItem.innerHTML = `
            <div class="quick-link-label">Link ${i + 1}</div>
            <input type="text"
                   class="link-name"
                   placeholder="Name (optional, default: #${i + 1})"
                   value="${link.name || ""}">
            <input type="text"
                   class="link-url"
                   placeholder="GitHub URL (e.g., https://github.com/org)"
                   value="${link.url || ""}">
            <select class="link-color" style="width: 100%; padding: 8px 12px; border: 1px solid #d0d7de; border-radius: 6px; font-size: 13px; box-sizing: border-box; margin-top: 6px;">
                ${colorOptionsHtml}
            </select>`;
        quickLinksContainer.appendChild(linkItem);
    }

    // Add auto-save on input change
    const allInputs = quickLinksContainer.querySelectorAll("input, select");
    allInputs.forEach((input) => {
        input.addEventListener(
            "input",
            debounce(() => {
                autoSaveQuickLinks();
            }, 1000)
        );
        input.addEventListener(
            "change",
            debounce(() => {
                autoSaveQuickLinks();
            }, 500)
        );
    });
}

// Debounce function to prevent too frequent saves
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Auto-save quick links
function autoSaveQuickLinks() {
    const quickLinks = collectQuickLinks();

    // Validate URLs before saving
    for (const link of quickLinks) {
        if (link.url && !isValidGitHubUrl(link.url)) {
            console.log(`Invalid URL, not auto-saving: ${link.url}`);
            return;
        }
    }

    chrome.storage.sync.set({ quickAccessLinks: quickLinks }, () => {
        console.log("Quick links auto-saved");
        // Sync to JSON editor if currently in form view
        if (currentView === "form") {
            jsonEditor.value = JSON.stringify(quickLinks, null, 2);
            updateJsonLineNumbers();
        }
    });
}

// Display configured links
function displayConfiguredLinks(links = []) {
    const activeLinks = links.filter((link) => link.url);
    if (activeLinks.length === 0) {
        configuredLinksContainer.innerHTML =
            '<div class="help-text">No quick access links configured</div>';
        return;
    }

    configuredLinksContainer.innerHTML = activeLinks
        .map((link, idx) => {
            const displayName = link.name || `#${links.indexOf(link) + 1}`;
            const colorScheme =
                colorOptions.find((c) => c.value === link.color) ||
                colorOptions[0];
            return `
            <div class="configured-link-item" style="border-left: 4px solid ${colorScheme.border};">
                <strong>${displayName}</strong> <span style="color: ${colorScheme.text}; font-size: 11px; font-weight: 600;">[${colorScheme.name}]</span><br>
                <a href="${link.url}" target="_blank">${link.url}</a>
            </div>
        `;
        })
        .join("");
}

// Validate GitHub URL
function isValidGitHubUrl(url) {
    if (!url) return true;
    try {
        const parsed = new URL(url);
        return parsed.hostname === "github.com";
    } catch {
        return false;
    }
}

// Collect quick links from inputs
function collectQuickLinks() {
    const links = [];
    const nameInputs = quickLinksContainer.querySelectorAll(".link-name");
    const urlInputs = quickLinksContainer.querySelectorAll(".link-url");
    const colorSelects = quickLinksContainer.querySelectorAll(".link-color");

    for (let i = 0; i < 5; i++) {
        const name = nameInputs[i].value.trim();
        const url = urlInputs[i].value.trim();
        const color = colorSelects[i].value;

        if (url || name) {
            links.push({
                name,
                link_num: `LINK ${i + 1}`,
                url,
                color,
            });
        }
    }
    return links;
}

// Load saved token on popup open
chrome.storage.sync.get(
    ["githubToken", "quickAccessLinks", "extensionSettings"],
    async (data) => {
        // Load settings
        const defaultSettings = {
            showImportButton: true,
            showQuickAccessLinks: true,
            showForkUpstreamButtons: true,
            showRawPageButtons: true,
        };
        const settings = {
            ...defaultSettings,
            ...(data.extensionSettings || {}),
        };

        // Set checkbox states in both views
        setupImportBtn.checked = settings.showImportButton;
        setupQuickLinks.checked = settings.showQuickAccessLinks;
        setupForkUpstream.checked = settings.showForkUpstreamButtons;
        setupRawPage.checked = settings.showRawPageButtons;
        configImportBtn.checked = settings.showImportButton;
        configQuickLinks.checked = settings.showQuickAccessLinks;
        configForkUpstream.checked = settings.showForkUpstreamButtons;
        configRawPage.checked = settings.showRawPageButtons;

        if (data.githubToken) {
            savedToken = data.githubToken;
            displayTokenSpan.textContent = "••••••••••••••••••••";
            // If we have a token but no quick links, fetch orgs as defaults
            if (
                !data.quickAccessLinks ||
                data.quickAccessLinks.length === 0 ||
                data.quickAccessLinks.every((link) => !link.url)
            ) {
                try {
                    const orgsResponse = await fetch(
                        "https://api.github.com/user/orgs",
                        {
                            headers: {
                                Authorization: `token ${data.githubToken}`,
                                Accept: "application/vnd.github.v3+json",
                            },
                        }
                    );

                    if (orgsResponse.ok) {
                        const orgs = await orgsResponse.json();
                        const defaultColors = [
                            "green",
                            "yellow",
                            "blue",
                            "purple",
                            "green",
                        ];
                        const defaultLinks = orgs
                            .slice(0, 5)
                            .map((org, idx) => ({
                                name: org.login,
                                url: `https://github.com/${org.login}`,
                                color: defaultColors[idx],
                            }));

                        // Save default links
                        chrome.storage.sync.set({
                            quickAccessLinks: defaultLinks,
                        });
                        displayConfiguredLinks(defaultLinks);
                        initQuickLinks(defaultLinks);
                    } else {
                        displayConfiguredLinks(data.quickAccessLinks || []);
                        initQuickLinks(data.quickAccessLinks || []);
                    }
                } catch (err) {
                    console.log("Could not fetch organizations");
                    displayConfiguredLinks(data.quickAccessLinks || []);
                    initQuickLinks(data.quickAccessLinks || []);
                }
            } else {
                displayConfiguredLinks(data.quickAccessLinks || []);
                initQuickLinks(data.quickAccessLinks || []);
            }
            showConfiguredView();
        } else {
            document.getElementById("token-section").style.display = "block";
            document.getElementById("links-section").style.display = "block";
            showSetupView();
            initQuickLinks(data.quickAccessLinks || []);
        }
    }
);

// Save token
saveBtn.addEventListener("click", async () => {
    const tokenSectionVisible =
        document.getElementById("token-section").style.display !== "none";
    const linksSectionVisible =
        document.getElementById("links-section").style.display !== "none";

    const token = tokenInput.value.trim();
    const quickLinks = collectQuickLinks();

    // Validate quick links URLs if links section is visible
    if (linksSectionVisible) {
        for (const link of quickLinks) {
            if (link.url && !isValidGitHubUrl(link.url)) {
                showStatus(`Invalid GitHub URL: ${link.url}`, "error");
                return;
            }
        }
    }

    // If only editing links (token section hidden)
    if (!tokenSectionVisible) {
        chrome.storage.sync.set({ quickAccessLinks: quickLinks }, () => {
            showStatus("Quick access links saved!", "success");
            setTimeout(() => {
                showConfiguredView();
                displayConfiguredLinks(quickLinks);
            }, 1000);
        });
        return;
    }

    if (!token) {
        // Allow saving just quick links without token
        chrome.storage.sync.set({ quickAccessLinks: quickLinks }, () => {
            showStatus("Quick access links saved!", "success");
        });
        return;
    }

    // Validate token format
    if (!token.startsWith("ghp_") && !token.startsWith("github_pat_")) {
        showStatus(
            'Invalid token format. Token should start with "ghp_" or "github_pat_"',
            "error"
        );
        return;
    }

    // Test the token
    saveBtn.textContent = "Validating...";
    saveBtn.disabled = true;

    try {
        const response = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `token ${token}`,
                Accept: "application/vnd.github.v3+json",
            },
        });

        if (response.ok) {
            const user = await response.json();

            // Check if token has required scopes
            const scopes = response.headers.get("X-OAuth-Scopes") || "";
            const hasPublicRepo =
                scopes.includes("public_repo") || scopes.includes("repo");
            const hasReadOrg = scopes.includes("read:org");

            if (!hasPublicRepo || !hasReadOrg) {
                showStatus(
                    'Token is valid but missing required permissions. Please generate a new token with "public_repo" and "read:org" scopes.',
                    "error"
                );
                saveBtn.textContent = "Save Token";
                saveBtn.disabled = false;
                return;
            }

            // If quick links are empty, fetch user's organizations as defaults
            let linksToSave = quickLinks;
            if (
                quickLinks.length === 0 ||
                quickLinks.every((link) => !link.url)
            ) {
                try {
                    const orgsResponse = await fetch(
                        "https://api.github.com/user/orgs",
                        {
                            headers: {
                                Authorization: `token ${token}`,
                                Accept: "application/vnd.github.v3+json",
                            },
                        }
                    );

                    if (orgsResponse.ok) {
                        const orgs = await orgsResponse.json();
                        const defaultColors = [
                            "green",
                            "yellow",
                            "blue",
                            "purple",
                            "green",
                        ];
                        linksToSave = orgs.slice(0, 5).map((org, idx) => ({
                            name: org.login,
                            url: `https://github.com/${org.login}`,
                            color: defaultColors[idx],
                        }));
                    }
                } catch (err) {
                    console.log(
                        "Could not fetch organizations, using empty links"
                    );
                }
            }

            // Save token and quick links
            chrome.storage.sync.set(
                { githubToken: token, quickAccessLinks: linksToSave },
                () => {
                    showStatus(
                        `✓ Token saved! Authenticated as ${user.login}`,
                        "success"
                    );
                    setTimeout(() => {
                        showConfiguredView();
                        displayConfiguredLinks(linksToSave);
                    }, 1500);
                }
            );
        } else {
            const error = await response.json();
            showStatus(
                `Invalid token: ${error.message || "Authentication failed"}`,
                "error"
            );
            saveBtn.textContent = "Save Token";
            saveBtn.disabled = false;
        }
    } catch (err) {
        showStatus(
            "Network error. Please check your connection and try again.",
            "error"
        );
        saveBtn.textContent = "Save Token";
        saveBtn.disabled = false;
    }
});

// Change token
changeTokenBtn.addEventListener("click", () => {
    chrome.storage.sync.get(["quickAccessLinks"], (data) => {
        initQuickLinks(data.quickAccessLinks || []);
        tokenInput.value = "";
        tokenInput.disabled = false;
        document.getElementById("token-section").style.display = "block";
        document.getElementById("links-section").style.display = "none";
        showSetupView();
        tokenInput.focus();
    });
});

// Remove token
removeTokenBtn.addEventListener("click", () => {
    if (
        confirm(
            "Are you sure you want to remove your GitHub token? The extension will stop working until you add a new token."
        )
    ) {
        chrome.storage.sync.remove("githubToken", () => {
            showStatus("Token removed", "success");
            tokenInput.value = "";
            setTimeout(() => {
                showSetupView();
            }, 1000);
        });
    }
});

// Edit links button
editLinksBtn.addEventListener("click", () => {
    chrome.storage.sync.get(["quickAccessLinks"], (data) => {
        initQuickLinks(data.quickAccessLinks || []);
        document.getElementById("token-section").style.display = "none";
        document.getElementById("links-section").style.display = "block";
        showSetupView();
    });
});

// Helper functions
function showSetupView() {
    setupView.style.display = "block";
    configuredView.style.display = "none";
    const tokenSection = document.getElementById("token-section");
    const linksSection = document.getElementById("links-section");

    // Determine which section is visible and set button text accordingly
    if (tokenSection.style.display === "none") {
        saveBtn.textContent = "Save Links";
    } else if (linksSection.style.display === "none") {
        saveBtn.textContent = "Save Token";
    } else {
        saveBtn.textContent = "Save Token";
    }

    saveBtn.disabled = false;
    statusDiv.className = "status";
    statusDiv.textContent = "";
}

function showConfiguredView() {
    setupView.style.display = "none";
    configuredView.style.display = "block";
    statusDiv.className = "status";
    statusDiv.textContent = "";
}

function showStatus(message, type) {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
}

// Allow Enter key to save
tokenInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        saveBtn.click();
    }
});

// Settings change handlers
function saveSettings() {
    const settings = {
        showImportButton: setupImportBtn.checked,
        showQuickAccessLinks: setupQuickLinks.checked,
        showForkUpstreamButtons: setupForkUpstream.checked,
        showRawPageButtons: setupRawPage.checked,
    };
    chrome.storage.sync.set({ extensionSettings: settings });
}

function saveConfiguredSettings() {
    const settings = {
        showImportButton: configImportBtn.checked,
        showQuickAccessLinks: configQuickLinks.checked,
        showForkUpstreamButtons: configForkUpstream.checked,
        showRawPageButtons: configRawPage.checked,
        enableHotkeys: configHotkeys.checked,
    };
    chrome.storage.sync.set({ extensionSettings: settings });
}

// Setup view settings
setupImportBtn.addEventListener("change", saveSettings);
setupQuickLinks.addEventListener("change", saveSettings);
setupForkUpstream.addEventListener("change", saveSettings);
setupRawPage.addEventListener("change", saveSettings);
setupHotkeys.addEventListener("change", saveSettings);

// Configured view settings
configImportBtn.addEventListener("change", saveConfiguredSettings);
configQuickLinks.addEventListener("change", saveConfiguredSettings);
configForkUpstream.addEventListener("change", saveConfiguredSettings);
configRawPage.addEventListener("change", saveConfiguredSettings);
configHotkeys.addEventListener("change", saveConfiguredSettings);

// ===============================================
// Hotkey Management
// ===============================================

let currentHotkeys = [];

// Load hotkeys from storage
async function loadHotkeys() {
    return new Promise((resolve) => {
        chrome.storage.sync.get(["extensionSettings"], (result) => {
            const settings = result.extensionSettings || {};
            const defaultHotkeys = [
                { keys: ['g', 'v'], name: 'Repo Owner Homepage', url: null, dynamic: true, urlType: 'owner-home' },
                { keys: ['g', 'h'], name: 'Repo Owner Homepage Alt', url: null, dynamic: true, urlType: 'owner-home' },
                { keys: ['g', 'd'], name: 'Dashboard', url: null, dynamic: true, urlType: 'dashboard' },
                { keys: ['g', 'f'], name: 'Repo Owner Feed', url: null, dynamic: true, urlType: 'owner-feed' },
                { keys: ['g', 'c'], name: 'GitHub Copilot', url: 'https://github.com/copilot', dynamic: false, urlType: 'static' },
            ];
            // Load from extensionSettings.navHotkeys, fallback to defaults
            currentHotkeys = settings.navHotkeys || defaultHotkeys;
            resolve(currentHotkeys);
        });
    });
}

// Render hotkey editor
async function renderHotkeyEditor() {
    await loadHotkeys();
    hotkeysList.innerHTML = '';

    currentHotkeys.forEach((hotkey, index) => {
        const item = document.createElement('div');
        item.className = 'hotkey-item';

        const info = document.createElement('div');
        info.className = 'hotkey-info';

        const nameDiv = document.createElement('div');
        nameDiv.className = 'hotkey-name';
        nameDiv.textContent = hotkey.name;

        const displayDiv = document.createElement('div');
        displayDiv.className = 'hotkey-display';
        displayDiv.innerHTML = `<strong>${hotkey.keys.join(' + ')}</strong> → ${hotkey.dynamic ? `[Dynamic: ${hotkey.urlType}]` : hotkey.url}`;

        info.appendChild(nameDiv);
        info.appendChild(displayDiv);

        const editDiv = document.createElement('div');
        editDiv.className = 'hotkey-edit';

        const keysInput = document.createElement('input');
        keysInput.type = 'text';
        keysInput.className = 'hotkey-key-input';
        keysInput.placeholder = 'e.g., g+v';
        keysInput.value = hotkey.keys.join('+');
        keysInput.title = 'Use + to separate keys';

        const urlInput = document.createElement('input');
        urlInput.type = 'text';
        urlInput.className = 'hotkey-url-input';
        urlInput.placeholder = hotkey.dynamic ? '[Dynamic]' : 'Custom URL';
        urlInput.value = hotkey.url || '';
        urlInput.disabled = hotkey.dynamic;

        editDiv.appendChild(keysInput);
        editDiv.appendChild(urlInput);

        // Store references for later saving
        hotkey._keysInput = keysInput;
        hotkey._urlInput = urlInput;

        item.appendChild(info);
        item.appendChild(editDiv);
        hotkeysList.appendChild(item);
    });
}

// Show hotkey editor
editHotkeysBtn.addEventListener('click', async () => {
    await renderHotkeyEditor();
    hotkeyEditorDiv.style.display = 'block';
    editHotkeysBtn.style.display = 'none';
});

// Save hotkeys
saveHotkeysBtn.addEventListener('click', async () => {
    const updatedHotkeys = currentHotkeys.map((hotkey) => ({
        ...hotkey,
        keys: hotkey._keysInput.value.split('+').map(k => k.trim().toLowerCase()),
        url: hotkey.dynamic ? hotkey.url : hotkey._urlInput.value || null,
    }));

    // Load existing settings and update navHotkeys
    const result = await new Promise((resolve) => {
        chrome.storage.sync.get(['extensionSettings'], resolve);
    });
    const settings = result.extensionSettings || {};
    settings.navHotkeys = updatedHotkeys;

    // Save back to extensionSettings
    chrome.storage.sync.set({ extensionSettings: settings }, () => {
        hotkeyEditorDiv.style.display = 'none';
        editHotkeysBtn.style.display = 'block';
        showStatus('Hotkeys saved successfully!', 'success');
    });
});

// Cancel hotkey editor
cancelHotkeysBtn.addEventListener('click', () => {
    hotkeyEditorDiv.style.display = 'none';
    editHotkeysBtn.style.display = 'block';
});

// Load hotkeys on page load
document.addEventListener('DOMContentLoaded', async () => {
    const settings = await new Promise((resolve) => {
        chrome.storage.sync.get(['extensionSettings'], (result) => {
            resolve(result.extensionSettings || {});
        });
    });
    if (configHotkeys) {
        configHotkeys.checked = settings.enableHotkeys !== false;
    }
    if (setupHotkeys) {
        setupHotkeys.checked = settings.enableHotkeys !== false;
    }
});
