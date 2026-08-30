const locationForm = document.getElementById("locationForm");
const locationInput = document.getElementById("locationInput");

locationForm.addEventListener("submit", function (event) {
    event.preventDefault();

    const district = locationInput.value.trim();

    if (district) {
        const districtName = district.toLowerCase();

        window.location.href = `/places/${districtName}/`;
    }
});
const accountBtn = document.getElementById("accountBtn");
const accountWrapper = document.querySelector(".account-wrapper");
accountBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    accountWrapper.classList.toggle("active");
});
document.addEventListener("click", function (event) {
    if (!accountWrapper.contains(event.target)) {
        accountWrapper.classList.remove("active");
    }
});
/* CLOSE ACCOUNT MENU WHEN PAGE IS SCROLLED */
window.addEventListener("scroll", function () {
    accountWrapper.classList.remove("active");
});
/* =================================
   SETTINGS
================================= */

const settingsBtn = document.getElementById("settingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsClose = document.getElementById("settingsClose");

settingsBtn.addEventListener("click", function () {

    settingsOverlay.classList.add("active");

    accountWrapper.classList.remove("active");

});


/* CLOSE SETTINGS */

settingsClose.addEventListener("click", function () {

    settingsOverlay.classList.remove("active");

});


/* CLICK OUTSIDE SETTINGS */

settingsOverlay.addEventListener("click", function (event) {

    if (event.target === settingsOverlay) {

        settingsOverlay.classList.remove("active");

    }

});


/* =================================
   DARK MODE
================================= */

const darkModeBtn = document.getElementById("darkModeBtn");
const settingsDarkMode = document.getElementById("settingsDarkMode");
const themeStatus = document.getElementById("themeStatus");


function enableDarkMode() {

    document.body.classList.add("dark-mode");

    localStorage.setItem("theme", "dark");

    settingsDarkMode.checked = true;

    themeStatus.textContent = "ON";

}


function disableDarkMode() {

    document.body.classList.remove("dark-mode");

    localStorage.setItem("theme", "light");

    settingsDarkMode.checked = false;

    themeStatus.textContent = "OFF";

}


/* ACCOUNT DARK MODE */

darkModeBtn.addEventListener("click", function () {

    if (document.body.classList.contains("dark-mode")) {

        disableDarkMode();

    } else {

        enableDarkMode();

    }

});


/* SETTINGS TOGGLE */

settingsDarkMode.addEventListener("change", function () {

    if (this.checked) {

        enableDarkMode();

    } else {

        disableDarkMode();

    }

});


/* =================================
   LOAD SAVED THEME
================================= */
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") {
    enableDarkMode();
} else {
    disableDarkMode();
}