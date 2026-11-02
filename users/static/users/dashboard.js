// Dashboard page script: District selection & GPS Location resolver
document.addEventListener("DOMContentLoaded", function () {
    const locationForm = document.getElementById("locationForm");
    const locationSelect = document.getElementById("locationSelect");
    const locationInput = document.getElementById("locationInput");
    const currentLocationBtn = document.getElementById("currentLocationBtn");
    const gpsStatusMessage = document.getElementById("gpsStatusMessage");

    const DISTRICT_MAP = {
        // Chikkamagaluru
        "chikkamagaluru": "Chikkamagaluru",
        "chikmagalur": "Chikkamagaluru",
        "chikmagaluru": "Chikkamagaluru",
        "chikamanglore": "Chikkamagaluru",
        "chikkamangalore": "Chikkamagaluru",

        // Hampi / Vijayanagara
        "hampi": "Hampi",
        "vijayanagara": "Hampi",
        "hosapete": "Hampi",
        "hospet": "Hampi",

        // Udupi
        "udupi": "Udupi",
        "malpe": "Udupi",

        // Mangaluru
        "mangaluru": "Mangaluru",
        "mangalore": "Mangaluru",
        "dakshina kannada": "Mangaluru",
        "dakshinakannada": "Mangaluru",

        // Shivamogga
        "shivamogga": "Shivamogga",
        "shimoga": "Shivamogga",

        // Mandya
        "mandya": "Mandya",
        "srirangapatna": "Mandya",

        // Kodagu
        "kodagu": "kodagu",
        "madikeri": "kodagu",
        "coorg": "kodagu",

        // Mysore
        "mysore": "mysore",
        "mysuru": "mysore",

        // Hassan
        "hassan": "hassan",
        "belur": "hassan",
        "halebidu": "hassan",

        // Uttara Kannada
        "uttara kannada": "uttara kannada",
        "uttarakannada": "uttara kannada",
        "gokarna": "uttara kannada",
        "karwar": "uttara kannada",
        "dandeli": "uttara kannada",
        "sirsi": "uttara kannada"
    };

    // 1. Handle Form Submit (Dropdown or text input)
    if (locationForm) {
        locationForm.addEventListener("submit", function (event) {
            event.preventDefault();

            let chosen = "";
            if (locationSelect && locationSelect.value) {
                chosen = locationSelect.value.trim();
            } else if (locationInput && locationInput.value) {
                chosen = locationInput.value.trim();
            }

            if (!chosen) {
                if (gpsStatusMessage) {
                    gpsStatusMessage.textContent = "Please select a destination district first.";
                    gpsStatusMessage.style.color = "#b42318";
                }
                return;
            }

            const raw = chosen.toLowerCase();
            const district = DISTRICT_MAP[raw] || raw;
            document.cookie = "last_district_search=" + encodeURIComponent(district) + "; path=/; max-age=604800";
            window.location.href = `/places/${encodeURIComponent(district)}/`;
        });
    }

    // 2. Handle GPS Location Detection
    if (currentLocationBtn) {
        currentLocationBtn.addEventListener("click", function () {
            if (!navigator.geolocation) {
                if (gpsStatusMessage) {
                    gpsStatusMessage.textContent = "GPS is not supported by your browser. Please select a district above.";
                    gpsStatusMessage.style.color = "#b42318";
                } else {
                    alert("GPS is not supported by your browser.");
                }
                return;
            }

            const originalBtnHtml = currentLocationBtn.innerHTML;
            currentLocationBtn.disabled = true;
            currentLocationBtn.innerHTML = '<span><i class="fa-solid fa-spinner fa-spin" style="color: #2f7d4f;"></i></span> Locating nearest tourist district...';
            if (gpsStatusMessage) {
                gpsStatusMessage.textContent = "Requesting device GPS position...";
                gpsStatusMessage.style.color = "#555";
            }

            navigator.geolocation.getCurrentPosition(
                function (position) {
                    const userLat = position.coords.latitude;
                    const userLng = position.coords.longitude;

                    // Central coordinates of all 10 tourist districts in Karnataka
                    const hubDistricts = [
                        { name: "mysore", title: "Mysore (Mysuru)", lat: 12.2958, lng: 76.6394 },
                        { name: "kodagu", title: "Kodagu (Madikeri / Coorg)", lat: 12.4244, lng: 75.7382 },
                        { name: "hassan", title: "Hassan (Belur / Halebidu)", lat: 13.0033, lng: 76.1004 },
                        { name: "uttara kannada", title: "Uttara Kannada (Gokarna / Dandeli)", lat: 14.8136, lng: 74.1298 },
                        { name: "Chikkamagaluru", title: "Chikkamagaluru (Mullayanagiri)", lat: 13.3161, lng: 75.7720 },
                        { name: "Hampi", title: "Hampi (Vijayanagara)", lat: 15.3350, lng: 76.4600 },
                        { name: "Udupi", title: "Udupi (Krishna Temple / Malpe)", lat: 13.3409, lng: 74.7421 },
                        { name: "Mangaluru", title: "Mangaluru (Dakshina Kannada)", lat: 12.9141, lng: 74.8560 },
                        { name: "Shivamogga", title: "Shivamogga (Jog Falls)", lat: 13.9299, lng: 75.5681 },
                        { name: "Mandya", title: "Mandya (Srirangapatna)", lat: 12.5244, lng: 76.8958 }
                    ];

                    function haversine(lat1, lon1, lat2, lon2) {
                        const R = 6371; // Earth's radius in km
                        const dLat = (lat2 - lat1) * Math.PI / 180;
                        const dLon = (lon2 - lon1) * Math.PI / 180;
                        const a =
                            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                            Math.sin(dLon / 2) * Math.sin(dLon / 2);
                        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                    }

                    let nearest = hubDistricts[0];
                    let minDistance = Infinity;

                    for (const d of hubDistricts) {
                        const dist = haversine(userLat, userLng, d.lat, d.lng);
                        if (dist < minDistance) {
                            minDistance = dist;
                            nearest = d;
                        }
                    }

                    // Update UI dropdown
                    if (locationSelect) {
                        locationSelect.value = nearest.name;
                    }

                    if (gpsStatusMessage) {
                        gpsStatusMessage.innerHTML = `<strong>Nearest district found:</strong> ${nearest.title} (~${Math.round(minDistance)} km away). Opening destinations...`;
                        gpsStatusMessage.style.color = "#15803d";
                    }

                    currentLocationBtn.innerHTML = `<span><i class="fa-solid fa-circle-check" style="color: #15803d;"></i></span> Located: ${nearest.title}!`;

                    setTimeout(function () {
                        window.location.href = `/places/${encodeURIComponent(nearest.name)}/`;
                    }, 800);
                },
                function (err) {
                    currentLocationBtn.disabled = false;
                    currentLocationBtn.innerHTML = originalBtnHtml;

                    let errorMsg = "Could not retrieve your location. Please choose a district from the dropdown.";
                    if (err.code === 1) {
                        errorMsg = "Location access was denied. Please allow GPS permission in your browser or choose a district.";
                    } else if (err.code === 2) {
                        errorMsg = "GPS location unavailable on this device. Please select a district.";
                    } else if (err.code === 3) {
                        errorMsg = "GPS request timed out. Please try again or select a district.";
                    }

                    if (gpsStatusMessage) {
                        gpsStatusMessage.textContent = errorMsg;
                        gpsStatusMessage.style.color = "#b42318";
                    } else {
                        alert(errorMsg);
                    }
                },
                { timeout: 10000, enableHighAccuracy: true }
            );
        });
    }

    // 3. Settings panel toggles
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
});
