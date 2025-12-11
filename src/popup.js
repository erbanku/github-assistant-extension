// DOM elements
const setupView = document.getElementById("setup-view");
const configuredView = document.getElementById("configured-view");
const tokenInput = document.getElementById("token");
const saveBtn = document.getElementById("save-btn");
const changeTokenBtn = document.getElementById("change-token-btn");
const removeTokenBtn = document.getElementById("remove-token-btn");
const statusDiv = document.getElementById("status");

// Load saved token on popup open
chrome.storage.sync.get("githubToken", (data) => {
    if (data.githubToken) {
        showConfiguredView();
    } else {
        showSetupView();
    }
});

// Save token
saveBtn.addEventListener("click", async () => {
    const token = tokenInput.value.trim();

    if (!token) {
        showStatus("Please enter a token", "error");
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

            // Save token
            chrome.storage.sync.set({ githubToken: token }, () => {
                showStatus(
                    `✓ Token saved! Authenticated as ${user.login}`,
                    "success"
                );
                setTimeout(() => {
                    showConfiguredView();
                }, 1500);
            });
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
    tokenInput.value = "";
    showSetupView();
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

// Helper functions
function showSetupView() {
    setupView.style.display = "block";
    configuredView.style.display = "none";
    saveBtn.textContent = "Save Token";
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
