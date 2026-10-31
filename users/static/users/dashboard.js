// Dashboard page script.
// Nav, account menu and dark mode now live in topnav.js (shared by all pages).

const locationForm = document.getElementById("locationForm");
const locationInput = document.getElementById("locationInput");

if (locationForm && locationInput) {
    locationForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const DISTRICT_MAP = {"chikkamagaluru": "hassan", "chikmagalur": "hassan", "madikeri": "kodagu", "coorg": "kodagu", "gokarna": "uttara kannada", "dandeli": "uttara kannada", "karwar": "uttara kannada", "udupi": "uttara kannada", "hampi": "hassan", "mysuru": "mysore"};
        const raw = locationInput.value.trim().toLowerCase();
        const district = DISTRICT_MAP[raw] || raw;

        if (district) {
            window.location.href = `/places/${encodeURIComponent(district.toLowerCase())}/`;
        }
    });
}

/* Settings panel (optional - only if it is present on the page) */
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsClose = document.getElementById("settingsClose");
const settingsDarkMode = document.getElementById("settingsDarkMode");

if (settingsClose && settingsOverlay) {
    settingsClose.addEventListener("click", function () {
        settingsOverlay.classList.remove("active");
    });
    settingsOverlay.addEventListener("click", function (event) {
        if (event.target === settingsOverlay) {
            settingsOverlay.classList.remove("active");
        }
    });
}

if (settingsDarkMode) {
    settingsDarkMode.checked = document.body.classList.contains("dark-mode");
    settingsDarkMode.addEventListener("change", function () {
        const themeBtn = document.getElementById("tnavTheme");
        if (themeBtn) themeBtn.click();
    });
}
