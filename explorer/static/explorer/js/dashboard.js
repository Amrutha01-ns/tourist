
const locationButton =
    document.getElementById("locationButton");
const locationStatus =
    document.getElementById("locationStatus");
locationButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
        locationStatus.textContent =
            "Location is not supported by your browser.";
        return;
    }
    locationStatus.textContent =
        "Detecting your location...";
    locationButton.disabled = true;
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const latitude =
                position.coords.latitude;
            const longitude =
                position.coords.longitude;
            console.log("Latitude:", latitude);
            console.log("Longitude:", longitude);
            locationStatus.textContent =
                "Location enabled ✓";
            locationButton.textContent =
                "Enabled";
        },
        () => {
            locationStatus.textContent =
                "Location permission was not granted.";
            locationButton.disabled = false;
        }
    );
});
/* ================================
   BUDGET
================================ */
const budgetSlider =
    document.getElementById("budgetSlider");
const budgetValue =
    document.getElementById("budgetValue");
budgetSlider.addEventListener("input", () => {
    const value =
        Number(budgetSlider.value);
    budgetValue.textContent =
        `₹${value.toLocaleString("en-IN")}`;
});
/* ================================
   TRAVELLERS
================================ */
const travellersInput =
    document.getElementById("travellersInput");
const decreaseTravellers =
    document.getElementById("decreaseTravellers");
const increaseTravellers =
    document.getElementById("increaseTravellers");
if (
    travellersInput &&
    decreaseTravellers &&
    increaseTravellers
) {
    decreaseTravellers.addEventListener("click", () => {
        const value =
            parseInt(travellersInput.value, 10);
        if (value > 1) {
            travellersInput.value =
                value - 1;
        }
    });
    increaseTravellers.addEventListener("click", () => {
        const value =
            parseInt(travellersInput.value, 10);
        if (value < 50) {
            travellersInput.value =
                value + 1;
        }
    });
}
/* ================================
   DAYS
================================ */
const daysInput =
    document.getElementById("daysInput");
const decreaseDays =
    document.getElementById("decreaseDays");
const increaseDays =
    document.getElementById("increaseDays");
if (
    daysInput &&
    decreaseDays &&
    increaseDays
) {
    decreaseDays.addEventListener("click", () => {
        const value =
            parseInt(daysInput.value, 10);
        if (value > 1) {
            daysInput.value =
                value - 1;
        }
    });
    increaseDays.addEventListener("click", () => {
        const value =
            parseInt(daysInput.value, 10);
        if (value < 30) {
            daysInput.value =
                value + 1;
        }
    });
}