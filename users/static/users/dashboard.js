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