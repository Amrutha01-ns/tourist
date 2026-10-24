document.addEventListener("DOMContentLoaded", function () {
    const accountBtn = document.getElementById("accountBtn");
    const accountMenu = document.getElementById("accountMenu");
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsOverlay = document.getElementById("settingsOverlay");
    const settingsClose = document.getElementById("settingsClose");
    const darkModeBtn = document.getElementById("darkModeBtn");
    const themeStatus = document.getElementById("themeStatus");
    const settingsDarkMode = document.getElementById("settingsDarkMode");

    // Apply the saved appearance preference.
    let darkMode = false;

    try {
        darkMode = localStorage.getItem("tourist-dark-mode") === "true";
    } catch (error) {
        // Continue with the default appearance if storage is unavailable.
    }

    function applyDarkMode(enabled) {
        darkMode = enabled;
        document.body.classList.toggle("account-dark", enabled);

        if (themeStatus) {
            themeStatus.textContent = enabled ? "ON" : "OFF";
        }

        if (settingsDarkMode) {
            settingsDarkMode.checked = enabled;
        }

        try {
            localStorage.setItem("tourist-dark-mode", String(enabled));
        } catch (error) {
            // Appearance still works for the current page.
        }
    }

    applyDarkMode(darkMode);

    // Open or close the account dropdown.
    if (accountBtn && accountMenu) {
        accountBtn.addEventListener("click", function (event) {
            event.stopPropagation();

            const isOpening = accountMenu.hidden;
            accountMenu.hidden = !isOpening;
            accountBtn.setAttribute("aria-expanded", String(isOpening));
        });

        accountMenu.addEventListener("click", function (event) {
            event.stopPropagation();
        });

        document.addEventListener("click", function () {
            accountMenu.hidden = true;
            accountBtn.setAttribute("aria-expanded", "false");
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                accountMenu.hidden = true;
                accountBtn.setAttribute("aria-expanded", "false");

                if (settingsOverlay) {
                    settingsOverlay.hidden = true;
                }
            }
        });
    }

    // Open Settings.
    if (settingsBtn && settingsOverlay) {
        settingsBtn.addEventListener("click", function () {
            settingsOverlay.hidden = false;

            if (accountMenu) {
                accountMenu.hidden = true;
                accountBtn.setAttribute("aria-expanded", "false");
            }
        });
    }

    // Close Settings.
    if (settingsClose && settingsOverlay) {
        settingsClose.addEventListener("click", function () {
            settingsOverlay.hidden = true;
        });

        settingsOverlay.addEventListener("click", function (event) {
            if (event.target === settingsOverlay) {
                settingsOverlay.hidden = true;
            }
        });
    }

    // Dark Mode works from either control.
    if (darkModeBtn) {
        darkModeBtn.addEventListener("click", function () {
            applyDarkMode(!darkMode);
        });
    }

    if (settingsDarkMode) {
        settingsDarkMode.addEventListener("change", function () {
            applyDarkMode(settingsDarkMode.checked);
        });
    }
});