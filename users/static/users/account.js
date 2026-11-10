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

    // =========================================================
    // GUEST REGISTRATION & SIGN-IN POPUP MODAL (DAILY RESET)
    // =========================================================
    const guestModal = document.getElementById("guestSignupModal");
    const guestClose = document.getElementById("guestModalCloseBtn");
    const guestDismiss = document.getElementById("guestModalDismissBtn");
    const guestFloat = document.getElementById("guestFloatingPill");
    const guestFloatBtn = document.getElementById("guestFloatBtn");

    function openGuestModal() {
        if (!guestModal) return;
        guestModal.removeAttribute("hidden");
        void guestModal.offsetWidth; // Force reflow
        guestModal.classList.add("active");
        if (guestFloat) guestFloat.style.display = "none";
    }

    function closeGuestModal(dismissForToday = false) {
        if (!guestModal) return;
        guestModal.classList.remove("active");
        setTimeout(function () {
            guestModal.setAttribute("hidden", "");
        }, 300);
        if (dismissForToday) {
            try {
                // Daily persistence: only dismisses for the current calendar day
                const todayStr = new Date().toDateString();
                localStorage.setItem("tourist_guest_dismissed_day", todayStr);
                // Clear obsolete 3-day lock if present
                localStorage.removeItem("tourist_guest_dismissed_time");
            } catch (_) {}
        }
        if (guestFloat) guestFloat.style.display = "block";
    }

    if (guestModal) {
        if (guestClose) {
            guestClose.addEventListener("click", function () {
                closeGuestModal(true);
            });
        }
        if (guestDismiss) {
            guestDismiss.addEventListener("click", function () {
                closeGuestModal(true);
            });
        }
        if (guestFloatBtn) {
            guestFloatBtn.addEventListener("click", function (e) {
                e.preventDefault();
                openGuestModal();
            });
        }

        guestModal.addEventListener("click", function (e) {
            if (e.target === guestModal) {
                closeGuestModal(true);
            }
        });

        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && guestModal.classList.contains("active")) {
                closeGuestModal(true);
            }
        });

        // Daily eligibility check
        let dismissedDay = "";
        try {
            // Remove legacy 3-day restriction
            localStorage.removeItem("tourist_guest_dismissed_time");
            dismissedDay = localStorage.getItem("tourist_guest_dismissed_day") || "";
        } catch (_) {}

        const todayStr = new Date().toDateString();
        const isEligible = (dismissedDay !== todayStr);

        if (isEligible) {
            // Promptly display daily sign-in popup after 2.5 seconds
            let timerId = setTimeout(openGuestModal, 2500);
            let scrollTriggered = false;
            window.addEventListener("scroll", function onScroll() {
                if (!scrollTriggered && window.scrollY > 200) {
                    scrollTriggered = true;
                    clearTimeout(timerId);
                    setTimeout(openGuestModal, 400);
                    window.removeEventListener("scroll", onScroll);
                }
            });
        }
    }
});
