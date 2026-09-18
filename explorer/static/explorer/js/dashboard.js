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
/* BUDGET */
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