// ==============================================================================
// TOURIST KARNATAKA - UNIFIED LIVE LOCATION ENGINE (v2.0)
// High-accuracy live phone GPS with generous timeout (25s) and zero cache stale.
// Clean minimal UI with synchronized cross-page location.
// ==============================================================================

document.addEventListener("DOMContentLoaded", function () {
    const locationForm = document.getElementById("locationForm");
    const locationSelect = document.getElementById("locationSelect");
    const locationInput = document.getElementById("locationInput");

    const currentLocationBtn = document.getElementById("currentLocationBtn");
    const currentLocationBtnText = document.getElementById("currentLocationBtnText");
    const liveLocationHint = document.getElementById("liveLocationHint");
    const gpsStatusMessage = document.getElementById("gpsStatusMessage");

    const DISTRICT_MAP = {
        "chikkamagaluru": "Chikkamagaluru",
        "chikmagalur": "Chikkamagaluru",
        "chikmagaluru": "Chikkamagaluru",
        "chikamanglore": "Chikkamagaluru",
        "chikkamangalore": "Chikkamagaluru",
        "hampi": "Hampi",
        "vijayanagara": "Hampi",
        "hosapete": "Hampi",
        "hospet": "Hampi",
        "udupi": "Udupi",
        "malpe": "Udupi",
        "mangaluru": "Mangaluru",
        "mangalore": "Mangaluru",
        "dakshina kannada": "Mangaluru",
        "dakshinakannada": "Mangaluru",
        "shivamogga": "Shivamogga",
        "shimoga": "Shivamogga",
        "mandya": "Mandya",
        "srirangapatna": "Mandya",
        "kodagu": "kodagu",
        "madikeri": "kodagu",
        "coorg": "kodagu",
        "mysore": "mysore",
        "mysuru": "mysore",
        "hassan": "hassan",
        "belur": "hassan",
        "halebidu": "hassan",
        "uttara kannada": "uttara kannada",
        "uttarakannada": "uttara kannada",
        "gokarna": "uttara kannada",
        "karwar": "uttara kannada",
        "dandeli": "uttara kannada",
        "sirsi": "uttara kannada"
    };

    // Central coordinates of Karnataka tourist hub districts
    const HUB_DISTRICTS = [
        { name: "Mysore (Mysuru)", slug: "mysore", lat: 12.2958, lng: 76.6394 },
        { name: "Kodagu (Madikeri / Coorg)", slug: "kodagu", lat: 12.4244, lng: 75.7382 },
        { name: "Hassan (Belur / Halebidu)", slug: "hassan", lat: 13.0033, lng: 76.1004 },
        { name: "Uttara Kannada (Gokarna)", slug: "uttara kannada", lat: 14.8136, lng: 74.1298 },
        { name: "Chikkamagaluru", slug: "Chikkamagaluru", lat: 13.3161, lng: 75.7720 },
        { name: "Hampi (Vijayanagara)", slug: "Hampi", lat: 15.3350, lng: 76.4600 },
        { name: "Udupi", slug: "Udupi", lat: 13.3409, lng: 74.7421 },
        { name: "Mangaluru", slug: "Mangaluru", lat: 12.9141, lng: 74.8560 },
        { name: "Shivamogga (Jog Falls)", slug: "Shivamogga", lat: 13.9299, lng: 75.5681 },
        { name: "Mandya (Srirangapatna)", slug: "Mandya", lat: 12.5244, lng: 76.8958 }
    ];

    function haversineDist(lat1, lon1, lat2, lon2) {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
        return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
    }

    function calculateNearestDistrict(userLat, userLng) {
        let minD = Infinity;
        let best = HUB_DISTRICTS[0];
        for (const d of HUB_DISTRICTS) {
            const dist = haversineDist(userLat, userLng, d.lat, d.lng);
            if (dist < minD) {
                minD = dist;
                best = { ...d, distance_km: dist, url: `/places/${d.slug}/` };
            }
        }
        return best;
    }

    // --------------------------------------------------------------------------
    // 1. FORM SEARCH SUBMIT HANDLER
    // --------------------------------------------------------------------------
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
                showStatusMessage("Please select a destination district first.", "error");
                return;
            }

            const raw = chosen.toLowerCase();
            const district = DISTRICT_MAP[raw] || raw;
            document.cookie = "last_district_search=" + encodeURIComponent(district) + "; path=/; max-age=604800";
            window.location.href = `/places/${encodeURIComponent(district)}/`;
        });
    }

    function showStatusMessage(text, type = "info") {
        if (!gpsStatusMessage) return;
        gpsStatusMessage.style.display = "block";
        gpsStatusMessage.className = `gps-status-msg ${type === "error" ? "error-msg" : (type === "success" ? "success-msg" : "")}`;
        gpsStatusMessage.innerHTML = text;
    }

    function hideStatusMessage() {
        if (gpsStatusMessage) {
            gpsStatusMessage.style.display = "none";
            gpsStatusMessage.innerHTML = "";
        }
    }

    // --------------------------------------------------------------------------
    // 2. ACCURATE REVERSE GEOCODING API
    // --------------------------------------------------------------------------
    async function resolveLocationData(customLat, customLng) {
        if (customLat !== undefined && customLng !== undefined) {
            // Priority: BigDataCloud reverse geocode for exact coordinates
            try {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 4500);
                const resp = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${customLat}&longitude=${customLng}&localityLanguage=en`, { signal: controller.signal });
                clearTimeout(timer);
                if (resp.ok) {
                    const data = await resp.json();
                    const locality = data.locality || "";
                    const city = data.city || data.principalSubdivision || "";
                    const state = data.principalSubdivision || "";
                    let name = "";
                    if (locality && city && locality.toLowerCase() !== city.toLowerCase()) {
                        name = `${locality}, ${city}`;
                    } else if (city) {
                        name = state && !city.includes(state) ? `${city}, ${state}` : city;
                    } else {
                        name = state || "Your Location";
                    }
                    return { lat: customLat, lng: customLng, city: name };
                }
            } catch (_) {}

            // Secondary: OpenStreetMap Nominatim reverse geocode
            try {
                const controller2 = new AbortController();
                const timer2 = setTimeout(() => controller2.abort(), 4000);
                const resp2 = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${customLat}&lon=${customLng}&zoom=14`, {
                    signal: controller2.signal,
                    headers: { "Accept-Language": "en" }
                });
                clearTimeout(timer2);
                if (resp2.ok) {
                    const data2 = await resp2.json();
                    const addr = data2.address || {};
                    const city = addr.city || addr.town || addr.village || addr.suburb || addr.county || "";
                    const state = addr.state || "";
                    const fullName = state && !city.includes(state) ? `${city}, ${state}` : city;
                    if (city) return { lat: customLat, lng: customLng, city: fullName };
                }
            } catch (_) {}

            return { lat: customLat, lng: customLng, city: `Live GPS (${customLat.toFixed(3)}°, ${customLng.toFixed(3)}°)` };
        }

        // Fallback: IP-based lookup if no hardware coordinates available
        try {
            const resp = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client");
            if (resp.ok) {
                const data = await resp.json();
                const lat = parseFloat(data.latitude);
                const lng = parseFloat(data.longitude);
                const city = data.city || data.principalSubdivision || "Karnataka";
                const state = data.principalSubdivision || "";
                const fullName = state && !city.includes(state) ? `${city}, ${state}` : city;
                if (!isNaN(lat) && !isNaN(lng)) {
                    return { lat: lat, lng: lng, city: fullName };
                }
            }
        } catch (_) {}

        return null;
    }

    // --------------------------------------------------------------------------
    // 3. PERSIST & SYNCHRONIZE WITH EXPLORER & BACKEND
    // --------------------------------------------------------------------------
    async function applyAndSyncLocation(lat, lng, cityName, isHardwareGps = false, accuracy = 15) {
        // Save to localStorage & sessionStorage
        try {
            localStorage.setItem("tourist_user_lat", lat);
            localStorage.setItem("tourist_user_lng", lng);
            localStorage.setItem("tourist_user_city", cityName);
            localStorage.setItem("tourist_user_origin", `${cityName} (Live GPS)`);
            localStorage.setItem("tourist_live_lat", lat);
            localStorage.setItem("tourist_live_lng", lng);
            sessionStorage.setItem("tourist_live_lat", lat);
            sessionStorage.setItem("tourist_live_lng", lng);
            sessionStorage.setItem("tourist_user_city", cityName);

            // Set browser cookies for Django views across entire domain
            document.cookie = "tourist_user_lat=" + lat + "; path=/; max-age=604800; SameSite=Lax";
            document.cookie = "tourist_user_lng=" + lng + "; path=/; max-age=604800; SameSite=Lax";
            document.cookie = "tourist_user_city=" + encodeURIComponent(cityName) + "; path=/; max-age=604800; SameSite=Lax";
            document.cookie = "tourist_user_origin=" + encodeURIComponent(`${cityName} (Live GPS)`) + "; path=/; max-age=604800; SameSite=Lax";
        } catch (_) {}

        // Query backend for nearest Karnataka district
        let nearest = null;
        try {
            const apiResp = await fetch(`/users/api/nearest-district/?lat=${lat}&lng=${lng}`);
            if (apiResp.ok) {
                const json = await apiResp.json();
                if (json && json.nearest) nearest = json.nearest;
            }
        } catch (_) {}

        if (!nearest) {
            nearest = calculateNearestDistrict(lat, lng);
        }

        // Auto-select nearest district in the dropdown
        if (locationSelect && nearest) {
            locationSelect.value = nearest.slug;
        }

        // Clean UI Update on the button
        if (currentLocationBtn) {
            currentLocationBtn.classList.add("active-located");
        }
        if (currentLocationBtnText) {
            currentLocationBtnText.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${cityName}`;
        }
        if (liveLocationHint && nearest) {
            liveLocationHint.innerHTML = `<i class="fa-solid fa-location-dot" style="color:#2f7d4f;"></i> Detected: <b>${cityName}</b> · Nearest Hub: <b>${nearest.name}</b> (~${Math.round(nearest.distance_km)} km)`;
            liveLocationHint.style.color = "#15803d";
        }

        hideStatusMessage();
    }

    // --------------------------------------------------------------------------
    // 4. MAIN LOCATION DETECTOR (Generous 25s timeout for mobile GPS lock)
    // --------------------------------------------------------------------------
    let isLocating = false;

    async function detectLiveLocation(interactive = false) {
        if (isLocating) return;
        isLocating = true;

        if (interactive) {
            // When user explicitly clicks, clear any old cached locations!
            try {
                localStorage.removeItem("tourist_user_lat");
                localStorage.removeItem("tourist_user_lng");
                localStorage.removeItem("tourist_user_city");
                localStorage.removeItem("tourist_live_lat");
                localStorage.removeItem("tourist_live_lng");
                sessionStorage.clear();
            } catch (_) {}
        }

        if (currentLocationBtn) currentLocationBtn.disabled = true;
        if (currentLocationBtnText) {
            currentLocationBtnText.innerHTML = '<i class="fa-solid fa-satellite-dish fa-spin"></i> Detecting live GPS...';
        }

        showStatusMessage('<i class="fa-solid fa-satellite-dish fa-spin"></i> Contacting device GPS... Please tap <b>Allow / While using the app</b> on your phone.', "info");

        // Strategy A: Request Device GPS (with 25-second generous timeout)
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                async function (pos) {
                    isLocating = false;
                    if (currentLocationBtn) currentLocationBtn.disabled = false;

                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    const acc = Math.round(pos.coords.accuracy || 15);

                    showStatusMessage('<i class="fa-solid fa-circle-check" style="color:#16a34a;"></i> GPS position locked! Resolving address...', "info");

                    const loc = await resolveLocationData(lat, lng);
                    const cityName = loc ? loc.city : `Live Location (${lat.toFixed(3)}°, ${lng.toFixed(3)}°)`;

                    await applyAndSyncLocation(lat, lng, cityName, true, acc);
                },
                async function (err) {
                    console.warn("Hardware GPS error/timeout:", err);

                    // If user actively denied permission
                    if (err.code === 1) {
                        isLocating = false;
                        if (currentLocationBtn) currentLocationBtn.disabled = false;
                        if (currentLocationBtnText) {
                            currentLocationBtnText.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use My Current Location';
                        }
                        showStatusMessage('⚠️ Location permission was denied. Tap the lock icon in your browser address bar, set Location to "Allow", and tap again.', "error");
                        return;
                    }

                    // On timeout or hardware unavailable, fallback to network IP
                    const loc = await resolveLocationData();
                    isLocating = false;
                    if (currentLocationBtn) currentLocationBtn.disabled = false;

                    if (loc) {
                        await applyAndSyncLocation(loc.lat, loc.lng, loc.city, false);
                    } else {
                        if (currentLocationBtnText) {
                            currentLocationBtnText.innerHTML = '<i class="fa-solid fa-location-crosshairs"></i> Use My Current Location';
                        }
                        showStatusMessage("Could not retrieve GPS location. Please select a district from the dropdown.", "error");
                    }
                },
                {
                    enableHighAccuracy: true,
                    timeout: 25000, // 25 seconds for user to tap Allow and for phone to lock on satellites
                    maximumAge: 0   // Fresh live reading, no stale cache
                }
            );
        } else {
            // Geolocation unsupported in browser
            const loc = await resolveLocationData();
            isLocating = false;
            if (currentLocationBtn) currentLocationBtn.disabled = false;
            if (loc) {
                await applyAndSyncLocation(loc.lat, loc.lng, loc.city, false);
            }
        }
    }

    // --------------------------------------------------------------------------
    // 5. EVENT LISTENERS
    // --------------------------------------------------------------------------
    if (currentLocationBtn) {
        currentLocationBtn.addEventListener("click", function () {
            detectLiveLocation(true);
        });
    }

    // --------------------------------------------------------------------------
    // 6. AUTO-SYNC OR DETECT ON LOAD
    // --------------------------------------------------------------------------
    const cachedCity = localStorage.getItem("tourist_user_city") || sessionStorage.getItem("tourist_user_city");
    const cachedLat = localStorage.getItem("tourist_user_lat") || sessionStorage.getItem("tourist_live_lat");
    const cachedLng = localStorage.getItem("tourist_user_lng") || sessionStorage.getItem("tourist_live_lng");

    if (cachedCity && cachedLat && cachedLng) {
        applyAndSyncLocation(parseFloat(cachedLat), parseFloat(cachedLng), cachedCity, true);
    } else {
        detectLiveLocation(false);
    }
});
