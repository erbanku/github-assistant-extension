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
            links.push({ name, url, color });
        }
    }
    return links;
}

// Load saved token on popup open
chrome.storage.sync.get(["githubToken", "quickAccessLinks"], async (data) => {
    if (data.githubToken) {
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
                    const defaultLinks = orgs.slice(0, 5).map((org, idx) => ({
                        name: org.login,
                        url: `https://github.com/${org.login}`,
                        color: defaultColors[idx],
                    }));

                    // Save default links
                    chrome.storage.sync.set({ quickAccessLinks: defaultLinks });
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
});

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
