
document.addEventListener("DOMContentLoaded", function () {
    const accountBtn = document.getElementById("accountBtn");
    const accountWrapper = document.querySelector(".account-wrapper");
    const accountMenu = document.getElementById("accountMenu");

    const settingsBtn = document.getElementById("settingsBtn");
    const settingsOverlay = document.getElementById("settingsOverlay");
    const settingsClose = document.getElementById("settingsClose");

    const darkModeBtn = document.getElementById("darkModeBtn");
    const settingsDarkMode = document.getElementById("settingsDarkMode");
    const themeStatus = document.getElementById("themeStatus");

    function closeAccountMenu() {
        if (accountWrapper) {
            accountWrapper.classList.remove("active");
        }

        if (accountBtn) {
            accountBtn.setAttribute("aria-expanded", "false");
            if (accountMenu) {
                accountMenu.setAttribute("hidden", "");
            }
        }
    }

    function closeSettings() {
        if (settingsOverlay) {
            settingsOverlay.classList.remove("active");
        }
    }

    function applyDarkMode(enabled) {
        document.body.classList.toggle("dark-mode", enabled);

        if (settingsDarkMode) {
            settingsDarkMode.checked = enabled;
        }

        if (themeStatus) {
            themeStatus.textContent = enabled ? "ON" : "OFF";
        }

        try {
            localStorage.setItem("theme", enabled ? "dark" : "light");
        } catch (error) {
            // Continue working if browser storage is unavailable.
        }
    }

    // EXPLORE DROPDOWN
    const exploreBtn = document.getElementById("exploreBtn");
    const exploreWrapper = document.getElementById("exploreWrapper");
    const exploreMenu = document.getElementById("exploreMenu");

    function closeExploreMenu() {
        if (exploreWrapper) {
            exploreWrapper.classList.remove("active");
        }
        if (exploreBtn) {
            exploreBtn.setAttribute("aria-expanded", "false");
        }
        if (exploreMenu) {
            exploreMenu.setAttribute("hidden", "");
        }
    }

    if (exploreBtn && exploreWrapper) {
        exploreBtn.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            closeAccountMenu();

            const opening = !exploreWrapper.classList.contains("active");
            exploreWrapper.classList.toggle("active", opening);
            exploreBtn.setAttribute("aria-expanded", String(opening));
            if (exploreMenu) {
                if (opening) {
                    exploreMenu.removeAttribute("hidden");
                } else {
                    exploreMenu.setAttribute("hidden", "");
                }
            }
        });

        document.addEventListener("click", function (event) {
            if (!exploreWrapper.contains(event.target)) {
                closeExploreMenu();
            }
        });

        window.addEventListener("scroll", closeExploreMenu);
    }

    // ACCOUNT DROPDOWN
    if (accountBtn && accountWrapper) {
        accountBtn.setAttribute("aria-expanded", "false");

        accountBtn.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();

            const opening = !accountWrapper.classList.contains("active");

            accountWrapper.classList.toggle("active", opening);
            accountBtn.setAttribute("aria-expanded", String(opening));
            if (accountMenu) {
                if (opening) {
                    accountMenu.removeAttribute("hidden");
                } else {
                    accountMenu.setAttribute("hidden", "");
                }
            }
        });

        if (accountMenu) {
            accountMenu.addEventListener("click", function (event) {
                event.stopPropagation();
            });
        }

        document.addEventListener("click", function (event) {
            if (!accountWrapper.contains(event.target)) {
                closeAccountMenu();
            }
        });

        window.addEventListener("scroll", closeAccountMenu);

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                closeAccountMenu();
                closeSettings();
            }
        });
    }

    // SETTINGS PANEL
    if (settingsBtn && settingsOverlay) {
        settingsBtn.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();

            closeAccountMenu();
            settingsOverlay.classList.add("active");
        });
    }

    if (settingsClose) {
        settingsClose.addEventListener("click", closeSettings);
    }

    if (settingsOverlay) {
        settingsOverlay.addEventListener("click", function (event) {
            if (event.target === settingsOverlay) {
                closeSettings();
            }
        });
    }

    // DARK MODE BUTTON
    if (darkModeBtn) {
        darkModeBtn.addEventListener("click", function (event) {
            event.preventDefault();

            const enabled = !document.body.classList.contains("dark-mode");
            applyDarkMode(enabled);
        });
    }

    // SETTINGS DARK MODE SWITCH
    if (settingsDarkMode) {
        settingsDarkMode.addEventListener("change", function () {
            applyDarkMode(settingsDarkMode.checked);
        });
    }

    // RESTORE THE SAVED THEME
    let savedTheme = "light";

    try {
        savedTheme = localStorage.getItem("theme") || "light";
    } catch (error) {
        // Use light mode when browser storage is unavailable.
    }

    applyDarkMode(savedTheme === "dark");
});
