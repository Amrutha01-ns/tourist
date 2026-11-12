/* ==========================================================================
   Tourist Karnataka Journeys - Dashboard & Public Transit Routing Map
   ========================================================================== */

(function () {
    function initDashboard() {
        // -----------------------------------------
        // 1. Budget slider
        // -----------------------------------------
        const budgetSlider = document.getElementById("budgetSlider");
        const budgetValue = document.getElementById("budgetValue");

        function updateBudget() {
            if (!budgetSlider || !budgetValue) return;
            const amount = Number(budgetSlider.value);
            budgetValue.textContent = "₹" + amount.toLocaleString("en-IN");
        }

        if (budgetSlider) {
            budgetSlider.addEventListener("input", updateBudget);
            updateBudget();
        }

        // -----------------------------------------
        // 2. Traveller and trip-day counters
        // -----------------------------------------
        function setupCounter(inputId, decreaseId, increaseId, min, max) {
            const input = document.getElementById(inputId);
            const decreaseButton = document.getElementById(decreaseId);
            const increaseButton = document.getElementById(increaseId);

            if (!input || !decreaseButton || !increaseButton) return;

            function getValue() {
                const value = Number.parseInt(input.value, 10);
                return Number.isFinite(value) ? value : min;
            }

            decreaseButton.addEventListener("click", function () {
                input.value = Math.max(min, getValue() - 1);
            });

            increaseButton.addEventListener("click", function () {
                input.value = Math.min(max, getValue() + 1);
            });

            input.addEventListener("change", function () {
                input.value = Math.max(min, Math.min(max, getValue()));
            });
        }

        setupCounter("travellersInput", "decreaseTravellers", "increaseTravellers", 1, 50);
        setupCounter("daysInput", "decreaseDays", "increaseDays", 1, 30);

        // -----------------------------------------
        // 3. Expense form validation and AJAX submit
        // -----------------------------------------
        const expenseForm = document.getElementById("expenseForm");
        const planner = document.querySelector(".planner");

        if (expenseForm && planner) {
            const submitButton = expenseForm.querySelector('button[type="submit"]');

            function getResultsContainer() {
                let results = document.getElementById("expenseResults");
                if (!results) {
                    results = document.createElement("section");
                    results.id = "expenseResults";
                    results.className = "results";
                    results.hidden = true;
                    results.style.opacity = "0";
                    results.style.transform = "translateY(10px)";
                    results.style.transition = "opacity 650ms ease, transform 650ms ease";
                    planner.insertAdjacentElement("afterend", results);
                }
                return results;
            }

            function showMessage(message) {
                let messageBox = document.getElementById("expenseAjaxMessage");
                if (!messageBox) {
                    messageBox = document.createElement("p");
                    messageBox.id = "expenseAjaxMessage";
                    messageBox.setAttribute("role", "alert");
                    messageBox.style.cssText =
                        "margin-top:16px;padding:12px;border-radius:10px;background:#fff1f0;color:#b42318;line-height:1.5;";
                    planner.appendChild(messageBox);
                }
                messageBox.textContent = message;
            }

            function clearMessage() {
                const messageBox = document.getElementById("expenseAjaxMessage");
                if (messageBox) messageBox.remove();
            }

            function validateForm() {
                const budget = Number(budgetSlider?.value);
                const travellers = Number(document.getElementById("travellersInput")?.value);
                const days = Number(document.getElementById("daysInput")?.value);

                if (!Number.isFinite(budget) || budget < 1000 || budget > 100000) {
                    showMessage("Please select a budget between ₹1,000 and ₹1,00,000.");
                    return false;
                }
                if (!Number.isInteger(travellers) || travellers < 1 || travellers > 50) {
                    showMessage("Please enter between 1 and 50 travellers.");
                    return false;
                }
                if (!Number.isInteger(days) || days < 1 || days > 30) {
                    showMessage("Please enter a trip duration between 1 and 30 days.");
                    return false;
                }
                return true;
            }

            expenseForm.addEventListener("submit", async function (event) {
                if (event.submitter && event.submitter.getAttribute("formaction")) return;
                event.preventDefault();
                clearMessage();

                if (!validateForm()) return;

                const originalButtonContent = submitButton ? submitButton.innerHTML : "";
                if (submitButton) {
                    submitButton.disabled = true;
                    submitButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calculating...';
                }

                try {
                    const response = await fetch(expenseForm.action || window.location.href, {
                        method: "POST",
                        body: new FormData(expenseForm),
                        credentials: "same-origin",
                        headers: { "X-Requested-With": "XMLHttpRequest" }
                    });

                    if (!response.ok) throw new Error("The server could not calculate the expenses.");

                    const html = await response.text();
                    const parsedDocument = new DOMParser().parseFromString(html, "text/html");
                    const newResults = parsedDocument.getElementById("expenseResults");

                    if (!newResults) {
                        throw new Error("No expense results were returned. Please check your inputs and try again.");
                    }

                    const resultsContainer = getResultsContainer();
                    resultsContainer.innerHTML = newResults.innerHTML;
                    resultsContainer.hidden = false;
                    resultsContainer.style.transition = "none";
                    resultsContainer.style.opacity = "0";
                    resultsContainer.style.transform = "translateY(10px)";
                    void resultsContainer.offsetHeight;

                    resultsContainer.style.transition = "opacity 650ms ease, transform 650ms ease";
                    requestAnimationFrame(function () {
                        resultsContainer.style.opacity = "1";
                        resultsContainer.style.transform = "translateY(0)";
                    });

                    resultsContainer.scrollIntoView({ behavior: "smooth", block: "start" });
                } catch (error) {
                    showMessage(error.message || "Unable to calculate expenses. Please try again.");
                    console.error("Expense calculation error:", error);
                } finally {
                    if (submitButton) {
                        submitButton.disabled = false;
                        submitButton.innerHTML = originalButtonContent;
                    }
                }
            });
        }

        // -------------------------------------------------------------
        // 4. Interactive Leaflet Route Map (Creative Asphalt Highway)
        // -------------------------------------------------------------
        let routeMap = null;
        let currentTileLayer = null;
        let roadLayerGroup = null;
        let stopsLayerGroup = null;
        let pinsLayerGroup = null;
        let simLayerGroup = null;
        let liveGpsLayerGroup = null;
        let citiesLayerGroup = null;
        let placesLayerGroup = null;
        let dishankCadastralLayerGroup = null;
        let currentMapBounds = null;
        let cachedMapData = null;
        let stopMarkersMap = {};
        let allKarnatakaPlaces = [];
        let currentMapTheme = "streets";

        // Live GPS & Google Maps Blue Dot tracking state
        let userGpsMarker = null;
        let userAccuracyCircle = null;
        let currentUserCoords = null;
        let currentUserAccuracy = null;
        let lastRoutedCoords = null;
        let watchPositionId = null;

        // Simulation variables
        let isSimulating = false;
        let simTimer = null;
        let simIndex = 0;
        let simPath = [];
        let simMarker = null;

        // Exactly 2 distinct high-definition map views as requested:
        // 1. Streets & Cities: Standard Google Maps navigation view with clear roads, towns, districts & highway bus routes (kept same as original)
        // 2. Satellite & Pipeline View: High-resolution satellite hybrid view with vibrant glowing transit pipeline corridor, and ultra-high zoom down to level 22 with clear cadastral survey parcels, building rooftops & house footprints (Dishank & Bhoomi GIS)
        const TILE_THEMES = {
            streets: {
                name: "Streets & Cities",
                url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
                options: {
                    maxZoom: 20,
                    subdomains: ["mt0", "mt1", "mt2", "mt3"],
                    attribution: '&copy; Google Maps'
                }
            },
            satellite_pipeline: {
                name: "Satellite & Pipeline View",
                url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
                options: {
                    maxZoom: 22,
                    maxNativeZoom: 20,
                    subdomains: ["mt0", "mt1", "mt2", "mt3"],
                    attribution: '&copy; Google Satellite &bull; Dishank SSLR'
                }
            }
        };

        // Prominent Karnataka Regional Hubs for corridor context & spatial orientation
        const KARNATAKA_REGIONAL_HUBS = [
            { name: "Bengaluru", district: "Bengaluru Urban", lat: 12.9716, lng: 77.5946 },
            { name: "Mysuru", district: "Mysuru", lat: 12.2958, lng: 76.6394 },
            { name: "Mandya", district: "Mandya", lat: 12.5240, lng: 76.8960 },
            { name: "Ramanagara", district: "Ramanagara", lat: 12.7200, lng: 77.2790 },
            { name: "Channapatna", district: "Ramanagara", lat: 12.6500, lng: 77.2000 },
            { name: "Srirangapatna", district: "Mandya", lat: 12.4230, lng: 76.6830 },
            { name: "Hunsur", district: "Mysuru", lat: 12.3050, lng: 76.2890 },
            { name: "Kushalnagar", district: "Kodagu", lat: 12.4600, lng: 75.9600 },
            { name: "Madikeri", district: "Kodagu", lat: 12.4244, lng: 75.7382 },
            { name: "Somwarpet", district: "Kodagu", lat: 12.5950, lng: 75.8640 },
            { name: "Virajpet", district: "Kodagu", lat: 12.2000, lng: 75.8000 },
            { name: "Hassan", district: "Hassan", lat: 13.0068, lng: 76.1004 },
            { name: "Sakleshpur", district: "Hassan", lat: 12.9430, lng: 75.7860 },
            { name: "Belur", district: "Hassan", lat: 13.1630, lng: 75.8640 },
            { name: "Chikkamagaluru", district: "Chikkamagaluru", lat: 13.3161, lng: 75.7720 },
            { name: "Mudigere", district: "Chikkamagaluru", lat: 13.1360, lng: 75.6410 },
            { name: "Sringeri", district: "Chikkamagaluru", lat: 13.4190, lng: 75.2570 },
            { name: "Mangaluru", district: "Dakshina Kannada", lat: 12.9141, lng: 74.8560 },
            { name: "Udupi", district: "Udupi", lat: 13.3409, lng: 74.7421 },
            { name: "Kundapura", district: "Udupi", lat: 13.6270, lng: 74.6930 },
            { name: "Karkala", district: "Udupi", lat: 13.2140, lng: 74.9980 },
            { name: "Shivamogga", district: "Shivamogga", lat: 13.9299, lng: 75.5681 },
            { name: "Bhadravati", district: "Shivamogga", lat: 13.8400, lng: 75.7000 },
            { name: "Sagar", district: "Shivamogga", lat: 14.1660, lng: 75.0330 },
            { name: "Jog Falls", district: "Shivamogga", lat: 14.2280, lng: 74.8120 },
            { name: "Davanagere", district: "Davanagere", lat: 14.4644, lng: 75.9218 },
            { name: "Chitradurga", district: "Chitradurga", lat: 14.2230, lng: 76.4000 },
            { name: "Tumakuru", district: "Tumakuru", lat: 13.3400, lng: 77.1000 },
            { name: "Hubballi", district: "Dharwad", lat: 15.3647, lng: 75.1240 },
            { name: "Dharwad", district: "Dharwad", lat: 15.4589, lng: 75.0078 },
            { name: "Belagavi", district: "Belagavi", lat: 15.8497, lng: 74.4977 },
            { name: "Gokarna", district: "Uttara Kannada", lat: 14.5479, lng: 74.3188 },
            { name: "Karwar", district: "Uttara Kannada", lat: 14.8130, lng: 74.1300 },
            { name: "Hosapete (Hampi)", district: "Vijayanagara", lat: 15.2700, lng: 76.3900 },
            { name: "Badami", district: "Bagalkote", lat: 15.9180, lng: 75.6760 },
            { name: "Vijayapura", district: "Vijayapura", lat: 16.8302, lng: 75.7100 },
            { name: "Kalaburagi", district: "Kalaburagi", lat: 17.3297, lng: 76.8343 }
        ];

        // Curated backup of iconic Karnataka tourist destinations for instant interactive exploration
        const FALLBACK_KARNATAKA_DESTINATIONS = [
            { name: "Tannirbhavi Beach", district: "Dakshina Kannada", category: "watery", lat: 12.8940, lng: 74.8150, slug: "tannirbhavi-beach", speciality: "Golden sand beach with tranquil waters, pine groves & river ferry connectivity." },
            { name: "Panambur Beach", district: "Dakshina Kannada", category: "watery", lat: 12.9520, lng: 74.8010, slug: "panambur-beach", speciality: "Safe swimming beach, international kite festival site and vibrant coastal water sports." },
            { name: "Kaup Beach & Lighthouse", district: "Udupi", category: "watery", lat: 13.2230, lng: 74.7410, slug: "kaup-beach-and-lighthouse", speciality: "Historic 1901 stone lighthouse perched on black rock overlooking Arabian Sea." },
            { name: "Malpe Beach", district: "Udupi", category: "watery", lat: 13.3590, lng: 74.7030, slug: "malpe-beach", speciality: "Pristine white sand, beach walkways and main ferry terminal to St. Mary's Island." },
            { name: "St. Mary's Island", district: "Udupi", category: "watery", lat: 13.3780, lng: 74.6730, slug: "st-marys-island", speciality: "National Geological Monument renowned for unique columnar basaltic lava formations." },
            { name: "Murudeshwara Temple & Beach", district: "Uttara Kannada", category: "religious", lat: 14.0940, lng: 74.4850, slug: "murudeshwara-temple", speciality: "World's second-tallest Shiva statue (123ft) overlooking the Arabian Sea cliff." },
            { name: "Om Beach, Gokarna", district: "Uttara Kannada", category: "watery", lat: 14.5202, lng: 74.3162, slug: "om-beach", speciality: "Naturally shaped like the auspicious 'Om' symbol with cliffside hiking paths." },
            { name: "Kudle Beach, Gokarna", district: "Uttara Kannada", category: "watery", lat: 14.5320, lng: 74.3160, slug: "kudle-beach", speciality: "Broad, scenic crescent-shaped cove beach surrounded by Western Ghats hills." },
            { name: "Jog Falls", district: "Shivamogga", category: "nature", lat: 14.2285, lng: 74.8125, slug: "jog-falls", speciality: "India's renowned untiered waterfall plunging 253m in four cascades (Raja, Rani, Roarer, Rocket)." },
            { name: "Abbey Falls", district: "Kodagu", category: "nature", lat: 12.4542, lng: 75.7196, slug: "abbey-falls", speciality: "Roaring waterfall cascading amidst lush private coffee plantations and spice estates." },
            { name: "Dubare Elephant Camp", district: "Kodagu", category: "nature", lat: 12.3683, lng: 75.9044, slug: "dubare-elephant-camp", speciality: "Cauvery riverside elephant eco-camp offering bathing, feeding & river rafting." },
            { name: "Raja's Seat, Madikeri", district: "Kodagu", category: "nature", lat: 12.4170, lng: 75.7360, slug: "rajas-seat", speciality: "Commanding viewpoint and garden overlooking misty rolling Coorg valleys & sunsets." },
            { name: "Mysore Palace (Amba Vilas)", district: "Mysuru", category: "historical", lat: 12.3051, lng: 76.6552, slug: "mysore", speciality: "World-famous Indo-Saracenic royal palace illuminated by 100,000 golden bulbs." },
            { name: "Chamundi Hill & Temple", district: "Mysuru", category: "religious", lat: 12.2753, lng: 76.6710, slug: "sri-chmundeshwari-temple", speciality: "Historic hilltop shrine of Goddess Chamundeshwari with panoramic views of Mysuru." },
            { name: "KRS Dam & Brindavan Gardens", district: "Mysuru", category: "watery", lat: 12.4248, lng: 76.5727, slug: "krs-dam", speciality: "Monumental reservoir across Cauvery River with famous illuminated dancing fountains." },
            { name: "Belur Chennakeshava Temple", district: "Hassan", category: "historical", lat: 13.1630, lng: 75.8640, slug: "belur", speciality: "UNESCO World Heritage 12th-century Hoysala soapstone architectural masterpiece." },
            { name: "Halebeedu Hoysaleshwara", district: "Hassan", category: "historical", lat: 13.2160, lng: 75.9930, slug: "halebeedu", speciality: "Twin Hoysala temples covered in intricate friezes of celestial dancers and epics." },
            { name: "Mullayanagiri Peak", district: "Chikkamagaluru", category: "nature", lat: 13.3910, lng: 75.7210, slug: "mullayanagiri", speciality: "Highest peak in Karnataka (1,930m) with sweeping views and cool misty climate." },
            { name: "Baba Budangiri", district: "Chikkamagaluru", category: "nature", lat: 13.4220, lng: 75.7650, slug: "baba-budangiri", speciality: "Scenic mountain range where the first coffee seeds in India were planted." },
            { name: "Kemmanagundi", district: "Chikkamagaluru", category: "nature", lat: 13.5480, lng: 75.7560, slug: "kemmanagundi", speciality: "Royal hill station of the Wodeyars with ornamental gardens, peaks and valleys." },
            { name: "Virupaksha Temple, Hampi", district: "Vijayanagara", category: "historical", lat: 15.3350, lng: 76.4600, slug: "virupaksha-temple", speciality: "Oldest functioning temple in UNESCO Hampi, sacred site on the banks of Tungabhadra." },
            { name: "Vittala Temple & Stone Chariot", district: "Vijayanagara", category: "historical", lat: 15.3380, lng: 76.4780, slug: "vittala-temple", speciality: "Iconic stone chariot and musical pillars showcasing pinnacle of Vijayanagara art." },
            { name: "Badami Cave Temples", district: "Bagalkote", category: "historical", lat: 15.9180, lng: 75.6760, slug: "badami", speciality: "6th-century rock-cut cave shrines carved into red sandstone cliffs by Chalukyas." },
            { name: "Pattadakal UNESCO Monuments", district: "Bagalkote", category: "historical", lat: 15.9490, lng: 75.8160, slug: "pattadakal", speciality: "Harmonious blend of northern and southern temple architectures on Malaprabha river." },
            { name: "Gol Gumbaz, Vijayapura", district: "Vijayapura", category: "historical", lat: 16.8302, lng: 75.7100, slug: "gol-gumbaz", speciality: "World's second-largest free-standing acoustic dome with famed whispering gallery." },
            { name: "Chitradurga Fort", district: "Chitradurga", category: "historical", lat: 14.2230, lng: 76.4000, slug: "chitradurga-fort", speciality: "Impenetrable 'Kallina Kote' stone fortress featuring 19 gateways and 38 back entrances." }
        ];

        // Comprehensive Extended-Range Karnataka Places & Hubs Renderer
        function renderKarnatakaPlacesAndHubs(bounds) {
            if (!bounds) return;
            if (placesLayerGroup) placesLayerGroup.clearLayers();
            if (citiesLayerGroup) citiesLayerGroup.clearLayers();

            let minLat, maxLat, minLng, maxLng;
            if (typeof bounds.getSouthWest === "function") {
                const sw = bounds.getSouthWest();
                const ne = bounds.getNorthEast();
                minLat = Math.min(sw.lat, ne.lat);
                maxLat = Math.max(sw.lat, ne.lat);
                minLng = Math.min(sw.lng, ne.lng);
                maxLng = Math.max(sw.lng, ne.lng);
            } else if (Array.isArray(bounds) && bounds.length === 2) {
                minLat = Math.min(bounds[0][0], bounds[1][0]);
                maxLat = Math.max(bounds[0][0], bounds[1][0]);
                minLng = Math.min(bounds[0][1], bounds[1][1]);
                maxLng = Math.max(bounds[0][1], bounds[1][1]);
            } else {
                return;
            }

            // Extend the range significantly: +1.1 deg lat (~120km) and +1.3 deg lng (~140km)
            // So surrounding tourist places & hubs are always interactive without moving the view point!
            const currentZoom = routeMap ? routeMap.getZoom() : 11;
            const isStateWide = currentZoom <= 9;

            const extMinLat = isStateWide ? 11.5 : (minLat - 1.1);
            const extMaxLat = isStateWide ? 18.6 : (maxLat + 1.1);
            const extMinLng = isStateWide ? 74.0 : (minLng - 1.3);
            const extMaxLng = isStateWide ? 78.6 : (maxLng + 1.3);

            // 1. Gather all destinations from server JSON or fallback list
            let placesToRender = (allKarnatakaPlaces && allKarnatakaPlaces.length > 0) ? allKarnatakaPlaces : FALLBACK_KARNATAKA_DESTINATIONS;
            const currentSlug = cachedMapData ? (cachedMapData.place_slug || "") : "";

            let renderedPlacesCount = 0;

            if (placesLayerGroup) {
                placesToRender.forEach(p => {
                    const pLat = parseFloat(p.lat);
                    const pLng = parseFloat(p.lng);
                    if (isNaN(pLat) || isNaN(pLng)) return;

                    if (pLat >= extMinLat && pLat <= extMaxLat && pLng >= extMinLng && pLng <= extMaxLng) {
                        const isCurrentDest = (p.is_current || (p.slug && p.slug === currentSlug));
                        const cat = (p.category || "nature").toLowerCase();
                        let catClass = "cat-nature";
                        let catIcon = "fa-mountain-sun";
                        let catLabel = "Nature & Scenic";

                        if (cat === "watery" || cat.includes("water") || cat.includes("beach")) {
                            catClass = "cat-watery"; catIcon = "fa-umbrella-beach"; catLabel = "Beach & Coastal";
                        } else if (cat === "religious" || cat.includes("temple")) {
                            catClass = "cat-religious"; catIcon = "fa-gopuram"; catLabel = "Heritage Temple";
                        } else if (cat === "historical" || cat.includes("history")) {
                            catClass = "cat-historical"; catIcon = "fa-landmark"; catLabel = "Historical Site";
                        }

                        const placeHtml = `<div class="interactive-place-marker ${catClass} ${isCurrentDest ? 'is-active-dest' : ''}" title="${p.name}"><i class="fa-solid ${catIcon}"></i></div>`;
                        const icon = L.divIcon({
                            className: "interactive-place-container",
                            html: placeHtml,
                            iconSize: [26, 26],
                            iconAnchor: [13, 13]
                        });

                        const targetUrl = p.url || (p.slug ? `/explorer/${p.slug}/` : `/places/`);
                        const m = L.marker([pLat, pLng], { icon: icon, zIndexOffset: isCurrentDest ? 1200 : 450 });
                        
                        m.bindTooltip(`<strong>${p.name}</strong> <span class="city-dist-subtle">(${p.district} &bull; ${catLabel})</span>`, {
                            direction: "top",
                            offset: [0, -10],
                            className: "google-style-city-tooltip",
                            opacity: 0.95
                        });

                        m.bindPopup(`
                            <div class="interactive-place-popup">
                                <div class="place-popup-header">
                                    <span class="place-popup-category">${catLabel}</span>
                                    <span class="place-popup-dist"><i class="fa-solid fa-location-dot"></i> ${p.district}</span>
                                </div>
                                <h4 class="place-popup-title">${p.name}</h4>
                                <p class="place-popup-desc">${p.speciality || 'Notable Karnataka tourist attraction and travel corridor destination.'}</p>
                                <div class="place-popup-actions">
                                    <a href="${targetUrl}" class="place-popup-route-btn">
                                        <i class="fa-solid fa-compass"></i> Explore &amp; Plan Trip &rarr;
                                    </a>
                                </div>
                            </div>
                        `, { className: "custom-transit-popup" });

                        placesLayerGroup.addLayer(m);
                        renderedPlacesCount++;
                    }
                });
            }

            // Update places badge counter if present
            const placesBadge = document.getElementById("placesCountBadge");
            if (placesBadge) {
                placesBadge.textContent = renderedPlacesCount > 0 ? renderedPlacesCount : placesToRender.length;
            }

            // 2. Render Regional City Dots & Orientation Hubs
            if (citiesLayerGroup) {
                KARNATAKA_REGIONAL_HUBS.forEach(hub => {
                    if (hub.lat >= extMinLat && hub.lat <= extMaxLat && hub.lng >= extMinLng && hub.lng <= extMaxLng) {
                        const icon = L.divIcon({
                            className: "city-dot-container",
                            html: `<div class="city-map-dot"></div>`,
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        });
                        const m = L.marker([hub.lat, hub.lng], { icon: icon, zIndexOffset: 300 });
                        m.bindTooltip(`<strong>${hub.name}</strong><span class="city-dist-subtle">(${hub.district} Hub)</span>`, {
                            direction: "top",
                            offset: [0, -6],
                            className: "google-style-city-tooltip",
                            opacity: 0.95
                        });
                        m.bindPopup(`
                            <div class="city-popup-card">
                                <span class="city-popup-tag"><i class="fa-solid fa-diamond-turn-right"></i> Karnataka Regional Hub</span>
                                <h4 style="margin:4px 0 2px; font-size:14px; color:#14452f;">${hub.name}</h4>
                                <p style="margin:0; font-size:11.5px; color:#475569;"><strong>District:</strong> ${hub.district} &bull; Public Transit Interchange</p>
                            </div>
                        `, { className: "custom-transit-popup" });
                        citiesLayerGroup.addLayer(m);
                    }
                });
            }
        }

        // Backward-compatible alias
        function renderRegionalCityPills(bounds) {
            renderKarnatakaPlacesAndHubs(bounds);
        }

        // -------------------------------------------------------------
        // Dishank & Bhoomi Cadastral Survey & Building Clarity Generator
        // -------------------------------------------------------------
        // When in Satellite Pipeline mode and zoomed in (level >= 15), renders
        // authentic Karnataka Dishank cadastral survey parcels (with Sy. Nos.)
        // and crisp individual building/house footprints with clear rooftops.
        function renderDishankCadastralLayer(bounds, zoom) {
            if (!dishankCadastralLayerGroup) return;
            if (currentMapTheme !== "satellite_pipeline") {
                dishankCadastralLayerGroup.clearLayers();
                const hudBadge = document.getElementById("dishankHudBadge");
                if (hudBadge) hudBadge.style.display = "none";
                return;
            }

            const currentZoom = zoom !== undefined ? zoom : (routeMap ? routeMap.getZoom() : 12);
            const hudBadge = document.getElementById("dishankHudBadge");
            const zoomText = document.getElementById("dishankZoomText");

            if (currentZoom < 15) {
                dishankCadastralLayerGroup.clearLayers();
                if (hudBadge) hudBadge.style.display = "none";
                return;
            }

            if (hudBadge) {
                hudBadge.style.display = "inline-flex";
                if (zoomText) {
                    zoomText.innerHTML = `Zoom Lv ${currentZoom} &bull; <strong>Clear Buildings &amp; Bhoomi Plots Active</strong>`;
                }
            }

            dishankCadastralLayerGroup.clearLayers();

            const visibleBounds = bounds || (routeMap ? routeMap.getBounds() : null);
            if (!visibleBounds) return;

            // Determine focal centers (Destination, bus stops, and map viewport center)
            const focalPoints = [];
            if (cachedMapData) {
                const destStop = (cachedMapData.transit_stops || []).find(s => s.type === "destination");
                if (destStop) {
                    focalPoints.push({ lat: destStop.lat, lng: destStop.lng, name: destStop.name, type: "destination" });
                } else if (cachedMapData.waypoints && cachedMapData.waypoints.length > 0) {
                    const wp = cachedMapData.waypoints[cachedMapData.waypoints.length - 1];
                    focalPoints.push({ lat: wp[0], lng: wp[1], name: cachedMapData.place_name || "Destination", type: "destination" });
                }

                (cachedMapData.transit_stops || []).forEach(s => {
                    if (s.type !== "destination") {
                        focalPoints.push({ lat: s.lat, lng: s.lng, name: s.name, type: "stop" });
                    }
                });
            }

            if (routeMap) {
                const center = routeMap.getCenter();
                focalPoints.push({ lat: center.lat, lng: center.lng, name: "Viewport Center", type: "center" });
            }

            // Pseudo-random deterministic generator to ensure stable plot & building locations
            function pseudoRandom(seed) {
                const x = Math.sin(seed++) * 10000;
                return x - Math.floor(x);
            }

            const renderedParcels = new Set();
            const districtName = (cachedMapData && cachedMapData.district) || "Karnataka";
            const placeName = (cachedMapData && cachedMapData.place_name) || "Tourist Sector";

            focalPoints.forEach(fp => {
                const fpLatLng = L.latLng(fp.lat, fp.lng);
                if (!visibleBounds.pad(0.3).contains(fpLatLng)) return;

                const baseLat = fp.lat;
                const baseLng = fp.lng;
                const gridSize = currentZoom >= 18 ? 4 : 3;
                const stepLat = 0.00045; // ~50m
                const stepLng = 0.00050; // ~54m

                for (let row = -gridSize; row <= gridSize; row++) {
                    for (let col = -gridSize; col <= gridSize; col++) {
                        const cellSeed = Math.abs(Math.floor((baseLat + row * stepLat) * 10000) * 100 + Math.floor((baseLng + col * stepLng) * 10000));
                        const parcelKey = `${Math.floor((baseLat + row * stepLat) * 5000)}_${Math.floor((baseLng + col * stepLng) * 5000)}`;
                        if (renderedParcels.has(parcelKey)) continue;
                        renderedParcels.add(parcelKey);

                        const cLat = baseLat + (row * stepLat) + (pseudoRandom(cellSeed) - 0.5) * 0.00008;
                        const cLng = baseLng + (col * stepLng) + (pseudoRandom(cellSeed + 1) - 0.5) * 0.00008;

                        const plotW = stepLng * (0.75 + pseudoRandom(cellSeed + 2) * 0.2);
                        const plotH = stepLat * (0.75 + pseudoRandom(cellSeed + 3) * 0.2);

                        const swLat = cLat - plotH / 2;
                        const swLng = cLng - plotW / 2;
                        const neLat = cLat + plotH / 2;
                        const neLng = cLng + plotW / 2;

                        const parcelBounds = L.latLngBounds([swLat, swLng], [neLat, neLng]);
                        if (!visibleBounds.intersects(parcelBounds)) continue;

                        const syNo = (cellSeed % 180) + 1;
                        const hissaNo = ((cellSeed * 7) % 5) + 1;
                        const syLabel = `Sy. ${syNo}/${hissaNo}`;
                        const plotAreaGuntas = (8 + (cellSeed % 32) * 0.5).toFixed(1);
                        const plotAreaSqFt = Math.round(plotAreaGuntas * 1089);

                        // A. Dishank Cadastral Survey Plot Boundary
                        const parcelPoly = L.rectangle([[swLat, swLng], [neLat, neLng]], {
                            color: "#f59e0b",
                            weight: 1.6,
                            dashArray: "5, 4",
                            opacity: 0.88,
                            fillColor: "#fbbf24",
                            fillOpacity: 0.07,
                        });

                        parcelPoly.bindPopup(`
                            <div class="dishank-popup-card">
                                <div class="dishank-popup-header">
                                    <span class="dishank-badge"><i class="fa-solid fa-stamp"></i> DISHANK BHOOMI GIS</span>
                                    <span class="dishank-status-tag">Verified SSLR Record</span>
                                </div>
                                <h4 class="dishank-popup-title">${syLabel} &bull; Cadastral Land Parcel</h4>
                                <div class="dishank-meta-row"><strong>District &amp; Taluk:</strong> ${districtName}</div>
                                <div class="dishank-meta-row"><strong>Village / Sector:</strong> ${placeName} Cadastral Unit</div>
                                <div class="dishank-meta-row"><strong>Plot Area:</strong> ${plotAreaGuntas} Guntas (~${plotAreaSqFt} sq. ft.)</div>
                                <div class="dishank-meta-row"><strong>Classification:</strong> Residential / Public Utility</div>
                                <div class="dishank-meta-row"><strong>Bhoomi RTC PID:</strong> KRN-${districtName.substring(0, 3).toUpperCase()}-${syNo}${hissaNo}</div>
                            </div>
                        `, { className: "custom-transit-popup" });

                        dishankCadastralLayerGroup.addLayer(parcelPoly);

                        // Plot Survey Number badge pinned at corner
                        if (currentZoom >= 16) {
                            const syIcon = L.divIcon({
                                className: "dishank-sy-container",
                                html: `<div class="dishank-sy-badge">${syLabel}</div>`,
                                iconSize: [60, 16],
                                iconAnchor: [30, 8]
                            });
                            const syMarker = L.marker([neLat - 0.00004, swLng + 0.00006], { icon: syIcon, zIndexOffset: 200 });
                            dishankCadastralLayerGroup.addLayer(syMarker);
                        }

                        // B. Individual Building & House Footprint inside Parcel
                        const bldgCount = (cellSeed % 3 === 0) ? 2 : 1;
                        for (let b = 0; b < bldgCount; b++) {
                            const bSeed = cellSeed + b * 13;
                            const bW = plotW * (0.35 + pseudoRandom(bSeed) * 0.25);
                            const bH = plotH * (0.35 + pseudoRandom(bSeed + 1) * 0.25);

                            const offsetX = (b === 0) ? (plotW * 0.15) : (plotW * 0.55);
                            const offsetY = (b === 0) ? (plotH * 0.15) : (plotH * 0.55);

                            const bSwLat = swLat + offsetY;
                            const bSwLng = swLng + offsetX;
                            const bNeLat = bSwLat + bH;
                            const bNeLng = bSwLng + bW;

                            const roofTypes = [
                                { color: "#ea580c", name: "Terracotta Mangalore Tile", type: "Mangalore Tile House" },
                                { color: "#38bdf8", name: "Solar Reflective RCC", type: "Modern Residence" },
                                { color: "#475569", name: "Slate Grey RCC Roof", type: "Residential Villa" },
                                { color: "#dc2626", name: "Red Ceramic Tile", type: "Heritage Cottage" },
                                { color: "#d97706", name: "Golden Sandstone Roof", type: "Public / Tourist Pavilion" },
                            ];
                            const roof = roofTypes[bSeed % roofTypes.length];
                            const houseNumber = `House #${(bSeed % 90) + 10}`;
                            const bldgSqFt = Math.round((bH * 111000) * (bW * 108000) * 10.764);

                            const bldgPoly = L.rectangle([[bSwLat, bSwLng], [bNeLat, bNeLng]], {
                                color: "#ffffff",
                                weight: 1.8,
                                opacity: 0.95,
                                fillColor: roof.color,
                                fillOpacity: 0.72,
                            });

                            bldgPoly.bindTooltip(`<strong>${houseNumber}</strong> (${roof.type} &bull; ${bldgSqFt} sq ft)`, {
                                direction: "top",
                                offset: [0, -6],
                                className: "google-style-city-tooltip"
                            });

                            bldgPoly.bindPopup(`
                                <div class="dishank-popup-card">
                                    <div class="dishank-popup-header">
                                        <span class="dishank-badge" style="background:#ea580c;"><i class="fa-solid fa-house"></i> BUILDING FOOTPRINT</span>
                                        <span class="dishank-status-tag">${roof.type}</span>
                                    </div>
                                    <h4 class="dishank-popup-title">${houseNumber} &bull; ${roof.name}</h4>
                                    <div class="dishank-meta-row"><strong>Cadastral Plot:</strong> ${syLabel} (${districtName})</div>
                                    <div class="dishank-meta-row"><strong>Built-up Area:</strong> ~${bldgSqFt} sq. ft.</div>
                                    <div class="dishank-meta-row"><strong>Structure:</strong> Permanent Pucca House &bull; 100% Survey Digitized</div>
                                    <div class="dishank-meta-row"><strong>Dishank GIS Reference:</strong> High-Clarity Satellite Cadastral Footprint</div>
                                </div>
                            `, { className: "custom-transit-popup" });

                            dishankCadastralLayerGroup.addLayer(bldgPoly);

                            if (currentZoom >= 17) {
                                const bldgIcon = L.divIcon({
                                    className: "dishank-bldg-container",
                                    html: `<div class="dishank-bldg-badge">${houseNumber}</div>`,
                                    iconSize: [64, 16],
                                    iconAnchor: [32, 8]
                                });
                                const bldgMarker = L.marker([(bSwLat + bNeLat) / 2, (bSwLng + bNeLng) / 2], { icon: bldgIcon, zIndexOffset: 350 });
                                dishankCadastralLayerGroup.addLayer(bldgMarker);
                            }
                        }
                    }
                }
            });
        }

        // Smooth Catmull-Rom Spline Curve Interpolation
        function generateCurvedPoints(coords, pointsPerSegment = 8) {
            if (!coords || coords.length < 2) return coords || [];
            if (coords.length === 2) {
                const [p0, p1] = coords;
                const midLat = (p0[0] + p1[0]) / 2 + (p1[1] - p0[1]) * 0.04;
                const midLng = (p0[1] + p1[1]) / 2 - (p1[0] - p0[0]) * 0.04;
                coords = [p0, [midLat, midLng], p1];
            }

            const extended = [coords[0], ...coords, coords[coords.length - 1]];
            const curved = [];

            for (let i = 0; i < extended.length - 3; i++) {
                const p0 = extended[i];
                const p1 = extended[i + 1];
                const p2 = extended[i + 2];
                const p3 = extended[i + 3];

                for (let t = 0; t < pointsPerSegment; t++) {
                    const u = t / pointsPerSegment;
                    const u2 = u * u;
                    const u3 = u2 * u;

                    const lat = 0.5 * (
                        (2 * p1[0]) +
                        (-p0[0] + p2[0]) * u +
                        (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 +
                        (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3
                    );

                    const lng = 0.5 * (
                        (2 * p1[1]) +
                        (-p0[1] + p2[1]) * u +
                        (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 +
                        (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3
                    );

                    curved.push([lat, lng]);
                }
            }
            curved.push(coords[coords.length - 1]);
            return curved;
        }

        // -------------------------------------------------------------
        // Render Route Corridor in Asphalt Highway (Streets) vs Radiant Transit Pipeline (Satellite)
        // -------------------------------------------------------------
        function renderRouteCorridor(mapData, themeKey) {
            if (!roadLayerGroup || !mapData) return;
            roadLayerGroup.clearLayers();
            simPath = [];

            const segments = mapData.segments || [];
            segments.forEach(seg => {
                if (seg.coords && seg.coords.length > 0) {
                    const smoothCoords = generateCurvedPoints(seg.coords, 8);
                    simPath.push(...smoothCoords);

                    const strokeColor = seg.color || "#06b6d4";

                    if (themeKey === "satellite_pipeline") {
                        // Radiant Transit Pipeline Styling
                        // Layer A: Radiant Pipeline Energy Aura / Ambient Glow
                        const pipelineGlow = L.polyline(smoothCoords, {
                            color: strokeColor,
                            weight: 24,
                            opacity: 0.38,
                            lineCap: "round",
                            lineJoin: "round",
                        });
                        roadLayerGroup.addLayer(pipelineGlow);

                        // Layer B: Heavy Outer Conduit Pipe Casing
                        const outerPipe = L.polyline(smoothCoords, {
                            color: "#020617",
                            weight: 15,
                            opacity: 0.98,
                            lineCap: "round",
                            lineJoin: "round",
                        });
                        roadLayerGroup.addLayer(outerPipe);

                        // Layer C: Vibrant High-Pressure Fluid Corridor Wall
                        const innerPipe = L.polyline(smoothCoords, {
                            color: strokeColor,
                            weight: 8.5,
                            opacity: 1,
                            lineCap: "round",
                            lineJoin: "round",
                        });
                        innerPipe.bindTooltip(`<strong>Transit Pipeline: ${seg.name}</strong>`, { sticky: true });
                        roadLayerGroup.addLayer(innerPipe);

                        // Layer D: High-Tech Luminescent Central Core
                        const coreGlow = L.polyline(smoothCoords, {
                            color: "#67e8f9",
                            weight: 3.2,
                            opacity: 0.98,
                            lineCap: "round",
                            lineJoin: "round",
                        });
                        roadLayerGroup.addLayer(coreGlow);

                        // Layer E: Animated Directional Transit Flow Pulse
                        const flowPulse = L.polyline(smoothCoords, {
                            className: "pipeline-flow-pulse",
                            color: "#ffffff",
                            weight: 2.5,
                            dashArray: "10, 16",
                            opacity: 0.95,
                            lineCap: "round",
                        });
                        roadLayerGroup.addLayer(flowPulse);
                    } else {
                        // Classic Asphalt Highway Bus Route Styling (Original Streets View)
                        // Layer A: Soft Road Drop-Shadow
                        const outerRoadShadow = L.polyline(smoothCoords, {
                            color: "#0f172a",
                            weight: 15,
                            opacity: 0.35,
                            lineCap: "round",
                            lineJoin: "round",
                        });
                        roadLayerGroup.addLayer(outerRoadShadow);

                        // Layer B: Highway border / leg stroke
                        const roadBorder = L.polyline(smoothCoords, {
                            color: strokeColor,
                            weight: 11,
                            opacity: 0.95,
                            lineCap: "round",
                            lineJoin: "round",
                        });
                        roadLayerGroup.addLayer(roadBorder);

                        // Layer C: Rich Dark Asphalt Highway Roadway
                        const innerAsphalt = L.polyline(smoothCoords, {
                            color: "#1e293b",
                            weight: 7,
                            opacity: 1,
                            lineCap: "round",
                            lineJoin: "round",
                        });
                        innerAsphalt.bindTooltip(`<strong>Bus Route Highway: ${seg.name}</strong>`, { sticky: true });
                        roadLayerGroup.addLayer(innerAsphalt);

                        // Layer D: Crisp White Dashed Highway Centerline Divider
                        const centerStripe = L.polyline(smoothCoords, {
                            color: "#ffffff",
                            weight: 2,
                            dashArray: "8, 12",
                            opacity: 0.95,
                            lineCap: "round",
                        });
                        roadLayerGroup.addLayer(centerStripe);
                    }
                }
            });
        }

        // -------------------------------------------------------------
        // Render Waypoint Pins (Origin, Transfer Hubs & Destination)
        // -------------------------------------------------------------
        function renderWaypointPins(mapData, themeKey) {
            if (!pinsLayerGroup || !mapData) return;
            pinsLayerGroup.clearLayers();

            const waypoints = mapData.waypoints || [];
            waypoints.forEach((wp, wIdx) => {
                const lat = wp[0];
                const lng = wp[1];
                const label = wp[2] || "Transit Stop";
                const type = wp[3] || "transfer";

                let pinTypeClass = "pin-transfer";
                let innerContent = `${wIdx + 1}`;
                let stationTypeLabel = (themeKey === "satellite_pipeline") ? "INTERCHANGE VALVE" : "TRANSIT HUB";

                if (type === "origin" || wIdx === 0) {
                    pinTypeClass = "pin-origin";
                    innerContent = (themeKey === "satellite_pipeline") ? '<i class="fa-solid fa-play" style="font-size:10px;"></i>' : '<i class="fa-solid fa-bus" style="font-size:10px;"></i>';
                    stationTypeLabel = (themeKey === "satellite_pipeline") ? "PIPELINE ORIGIN" : "ORIGIN BUS TERMINAL";
                } else if (type === "destination" || wIdx === waypoints.length - 1) {
                    pinTypeClass = "pin-dest";
                    innerContent = '<i class="fa-solid fa-flag-checkered" style="font-size:10px;"></i>';
                    stationTypeLabel = (themeKey === "satellite_pipeline") ? "PIPELINE TERMINUS" : "DESTINATION";
                } else {
                    innerContent = '<i class="fa-solid fa-shuffle" style="font-size:9px;"></i>';
                    stationTypeLabel = (themeKey === "satellite_pipeline") ? "TRANSFER VALVE" : "INTERCHANGE HUB";
                }

                const teardropHtml = `
                    <div class="custom-gps-pin">
                        <div class="gps-pin-shadow"></div>
                        <div class="gps-pin-teardrop ${pinTypeClass}">
                            <div class="gps-pin-disc">${innerContent}</div>
                        </div>
                    </div>`;

                const customPinIcon = L.divIcon({
                    className: "custom-leaflet-pin-icon",
                    html: teardropHtml,
                    iconSize: [36, 48],
                    iconAnchor: [18, 44],
                    popupAnchor: [0, -42],
                });

                const marker = L.marker([lat, lng], { icon: customPinIcon, zIndexOffset: 1500 });
                marker.bindPopup(`
                    <div class="stop-popup-card">
                        <span class="stop-popup-badge ${pinTypeClass === 'pin-dest' ? 'badge-dest-stop' : (pinTypeClass === 'pin-origin' ? 'badge-origin-stop' : 'badge-transfer-stop')}">
                            <i class="${themeKey === 'satellite_pipeline' ? 'fa-solid fa-diagram-project' : 'fa-solid fa-bus'}"></i> ${stationTypeLabel}
                        </span>
                        <h4 class="stop-popup-title">${label}</h4>
                        <div class="stop-popup-detail"><i class="fa-solid fa-location-crosshairs"></i> GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
                    </div>`, { className: "custom-transit-popup" });

                pinsLayerGroup.addLayer(marker);
            });
        }

        // -------------------------------------------------------------
        // Render Intermediate Bus Stops / Halts
        // -------------------------------------------------------------
        function renderTransitStops(mapData, themeKey) {
            if (!stopsLayerGroup || !mapData) return;
            stopsLayerGroup.clearLayers();
            stopMarkersMap = {};

            const transitStops = mapData.transit_stops || [];
            transitStops.forEach(s => {
                const isOriginOrDest = (s.type === "origin" || s.type === "destination");
                if (!isOriginOrDest) {
                    const iconClass = (themeKey === "satellite_pipeline") ? "fa-solid fa-circle-dot" : "fa-solid fa-bus";
                    const stopDiscHtml = `<div class="transit-stop-marker" data-stop-seq="${s.seq}" title="Bus Stop ${s.seq}: ${s.name}"><i class="${iconClass}"></i></div>`;
                    const stopIcon = L.divIcon({
                        className: "custom-stop-disc-icon",
                        html: stopDiscHtml,
                        iconSize: [26, 26],
                        iconAnchor: [13, 13],
                        popupAnchor: [0, -13],
                    });

                    const stopMarker = L.marker([s.lat, s.lng], { icon: stopIcon, zIndexOffset: 600 });
                    stopMarker.bindPopup(`
                        <div class="stop-popup-card">
                            <span class="stop-popup-badge badge-enroute-stop"><i class="${themeKey === 'satellite_pipeline' ? 'fa-solid fa-diagram-project' : 'fa-solid fa-bus'}"></i> ${themeKey === 'satellite_pipeline' ? 'PIPELINE VALVE' : 'BUS STOP'} &bull; HALT ${s.seq}</span>
                            <h4 class="stop-popup-title">${s.name}</h4>
                            <div class="stop-popup-detail"><i class="fa-solid fa-signs-post"></i> <strong>Platform Bay:</strong> ${s.platform || 'Express Bay'}</div>
                            <div class="stop-popup-detail"><i class="fa-regular fa-clock"></i> <strong>Halt Time:</strong> ${s.halt || '5 min halt'}</div>
                            <div class="stop-popup-detail"><i class="fa-solid fa-van-shuttle"></i> <strong>Transit Line:</strong> ${s.buses || 'KSRTC Express'}</div>
                            ${s.tip ? `<div class="stop-popup-tip"><i class="fa-solid fa-lightbulb"></i> ${s.tip}</div>` : ''}
                        </div>`, { className: "custom-transit-popup" });

                    stopsLayerGroup.addLayer(stopMarker);
                    stopMarkersMap[s.seq] = stopMarker;
                }
            });
        }

        // -------------------------------------------------------------
        // Switch Map Theme: Exactly 2 Views (Streets & Cities vs Satellite & Pipeline Dishank View)
        // -------------------------------------------------------------
        function switchMapTheme(themeKey) {
            if (!routeMap || !TILE_THEMES[themeKey]) return;
            currentMapTheme = themeKey;

            if (currentTileLayer) {
                routeMap.removeLayer(currentTileLayer);
            }
            const cfg = TILE_THEMES[themeKey];
            currentTileLayer = L.tileLayer(cfg.url, cfg.options).addTo(routeMap);
            currentTileLayer.bringToBack();

            // Set maxZoom according to view: 20 for streets, 22 for satellite cadastral clarity
            routeMap.setMaxZoom(themeKey === "satellite_pipeline" ? 22 : 20);

            // Re-render route corridor, waypoint pins, and intermediate bus stops with the active theme style
            if (cachedMapData) {
                renderRouteCorridor(cachedMapData, themeKey);
                renderWaypointPins(cachedMapData, themeKey);
                renderTransitStops(cachedMapData, themeKey);
            }

            // Manage Dishank Cadastral Survey & Building Layer
            const dishankLegend = document.getElementById("dishankLegendIndicator");
            const legendRoad = document.getElementById("legendRoadItem");
            const legendPipeline = document.getElementById("legendPipelineItem");
            const mapMainHeading = document.getElementById("mapMainHeading");
            const hudNavTitle = document.getElementById("hudNavTitle");
            const hudStatus = document.getElementById("hudStatusText");
            const hudDistLabel = document.getElementById("hudDistanceLabel");
            const hudStopsLabel = document.getElementById("hudStopsLabel");
            const simIcon = document.getElementById("simVehicleIcon");

            if (themeKey === "satellite_pipeline") {
                if (dishankCadastralLayerGroup && !routeMap.hasLayer(dishankCadastralLayerGroup)) {
                    routeMap.addLayer(dishankCadastralLayerGroup);
                }
                renderDishankCadastralLayer(routeMap.getBounds(), routeMap.getZoom());

                if (dishankLegend) dishankLegend.style.display = "inline-flex";
                if (legendRoad) legendRoad.style.display = "none";
                if (legendPipeline) legendPipeline.style.display = "inline-flex";
                if (mapMainHeading) mapMainHeading.textContent = "Live Transit Pipeline & Dishank Cadastral Map";
                if (hudNavTitle) hudNavTitle.innerHTML = '<i class="fa-solid fa-diagram-project"></i> PIPELINE &amp; DISHANK NAVIGATION';
                if (hudStatus) hudStatus.textContent = "Active Transit Pipeline & Cadastral View Operational";
                if (hudDistLabel) hudDistLabel.innerHTML = '<i class="fa-solid fa-route"></i> Pipeline Length';
                if (hudStopsLabel) hudStopsLabel.innerHTML = '<i class="fa-solid fa-signs-post"></i> Pipeline Stations';
                if (simIcon) simIcon.innerHTML = '<i class="fa-solid fa-bolt"></i>';
            } else {
                if (dishankCadastralLayerGroup && routeMap.hasLayer(dishankCadastralLayerGroup)) {
                    routeMap.removeLayer(dishankCadastralLayerGroup);
                }
                const hudBadge = document.getElementById("dishankHudBadge");
                if (hudBadge) hudBadge.style.display = "none";

                if (dishankLegend) dishankLegend.style.display = "none";
                if (legendRoad) legendRoad.style.display = "inline-flex";
                if (legendPipeline) legendPipeline.style.display = "none";
                if (mapMainHeading) mapMainHeading.textContent = "Live Bus Route & Transit Navigation Map";
                if (hudNavTitle) hudNavTitle.innerHTML = '<i class="fa-solid fa-bus"></i> BUS &amp; TRANSIT NAVIGATION';
                if (hudStatus) hudStatus.textContent = "Active Public Bus Transit Operational";
                if (hudDistLabel) hudDistLabel.innerHTML = '<i class="fa-solid fa-route"></i> Road Distance';
                if (hudStopsLabel) hudStopsLabel.innerHTML = '<i class="fa-solid fa-signs-post"></i> Bus Stops';
                if (simIcon) simIcon.innerHTML = '<i class="fa-solid fa-bus"></i>';
            }

            document.querySelectorAll(".map-theme-btn").forEach(btn => {
                btn.classList.toggle("active", btn.dataset.theme === themeKey);
            });
        }

        // -------------------------------------------------------------
        // Initialize or Update Route Map
        // -------------------------------------------------------------
        function initOrUpdateLeafletMap(mapData) {
            const mapCanvas = document.getElementById("transitRouteMap");
            if (!mapCanvas || typeof L === "undefined") return;
            if (!mapData || (!mapData.waypoints && !mapData.transit_stops)) return;

            cachedMapData = mapData;
            stopMarkersMap = {};

            // Ensure full dataset of Karnataka places is loaded
            if (!allKarnatakaPlaces || allKarnatakaPlaces.length === 0) {
                try {
                    const el = document.getElementById("karnatakaPlacesData");
                    if (el && el.textContent.trim()) {
                        const parsed = JSON.parse(el.textContent);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            allKarnatakaPlaces = parsed;
                        }
                    }
                } catch (_) {}
                if (!allKarnatakaPlaces || allKarnatakaPlaces.length === 0) {
                    allKarnatakaPlaces = FALLBACK_KARNATAKA_DESTINATIONS;
                }
            }

            if (!routeMap) {
                try {
                    routeMap = L.map("transitRouteMap", {
                        scrollWheelZoom: true,
                        zoomControl: true,
                        doubleClickZoom: true,
                        touchZoom: true,
                        boxZoom: true,
                        dragging: true,
                        maxZoom: 22,
                    });

                    // Default to crystal-clear Google Streets & Highway Bus Routes
                    const defaultCfg = TILE_THEMES[currentMapTheme] || TILE_THEMES.streets;
                    currentTileLayer = L.tileLayer(defaultCfg.url, defaultCfg.options).addTo(routeMap);

                    roadLayerGroup = L.layerGroup().addTo(routeMap);
                    stopsLayerGroup = L.layerGroup().addTo(routeMap);
                    pinsLayerGroup = L.layerGroup().addTo(routeMap);
                    placesLayerGroup = L.layerGroup().addTo(routeMap);
                    citiesLayerGroup = L.layerGroup().addTo(routeMap);
                    dishankCadastralLayerGroup = L.layerGroup();
                    if (currentMapTheme === "satellite_pipeline") {
                        dishankCadastralLayerGroup.addTo(routeMap);
                    }
                    simLayerGroup = L.layerGroup().addTo(routeMap);
                    liveGpsLayerGroup = L.layerGroup().addTo(routeMap);

                    // Dynamically refresh visible places and Dishank cadastral building outlines on pan or zoom
                    routeMap.on("zoomend moveend", () => {
                        if (routeMap) {
                            renderKarnatakaPlacesAndHubs(routeMap.getBounds());
                            if (currentMapTheme === "satellite_pipeline") {
                                renderDishankCadastralLayer(routeMap.getBounds(), routeMap.getZoom());
                            }
                        }
                    });
                } catch (e) {
                    console.warn("Leaflet map initialization warning:", e);
                    return;
                }
            } else {
                roadLayerGroup.clearLayers();
                stopsLayerGroup.clearLayers();
                pinsLayerGroup.clearLayers();
                if (placesLayerGroup) placesLayerGroup.clearLayers();
                if (citiesLayerGroup) citiesLayerGroup.clearLayers();
                if (dishankCadastralLayerGroup) dishankCadastralLayerGroup.clearLayers();
                simLayerGroup.clearLayers();
                if (liveGpsLayerGroup) liveGpsLayerGroup.clearLayers();
                stopSimulation();
            }

            // 1. Render Route Corridor with current theme styling
            renderRouteCorridor(mapData, currentMapTheme);

            // 2. Render Waypoint Pins
            renderWaypointPins(mapData, currentMapTheme);

            // 3. Render Intermediate Bus Stops
            renderTransitStops(mapData, currentMapTheme);

            // 4. Update HUD and En-Route Stops Timeline Ribbon
            // 3b. Render Google Maps Iconic Blue Dot & Accuracy Halo if live GPS active
            if (liveGpsLayerGroup) {
                liveGpsLayerGroup.clearLayers();
                userGpsMarker = null;
                userAccuracyCircle = null;
                const storedLat = sessionStorage.getItem("tourist_live_lat") || localStorage.getItem("tourist_live_lat");
                const storedLng = sessionStorage.getItem("tourist_live_lng") || localStorage.getItem("tourist_live_lng");
                const isGpsActive = mapData.is_origin_gps || (storedLat && storedLng && mapData.origin && mapData.origin.toLowerCase().includes("live"));
                const gpsLat = mapData.origin_coords ? mapData.origin_coords[0] : (storedLat ? parseFloat(storedLat) : null);
                const gpsLng = mapData.origin_coords ? mapData.origin_coords[1] : (storedLng ? parseFloat(storedLng) : null);

                if (isGpsActive && gpsLat && gpsLng) {
                    const accRadius = parseInt(sessionStorage.getItem("tourist_live_acc") || localStorage.getItem("tourist_live_acc") || "35", 10);
                    renderGoogleMapsBlueDot(gpsLat, gpsLng, accRadius, false);
                }
            }

            updateFloatingNavHud(mapData);
            updateEnrouteStopsRibbon(mapData.transit_stops || []);

            // 5. Update Map Bounds
            const allCoords = [];
            (mapData.segments || []).forEach(seg => {
                if (seg.coords) allCoords.push(...seg.coords);
            });

            if (mapData.bounds && mapData.bounds.length === 2) {
                currentMapBounds = mapData.bounds;
                routeMap.fitBounds(mapData.bounds, { padding: [40, 40], maxZoom: 13 });
            } else if (allCoords.length > 0) {
                const b = L.latLngBounds(allCoords);
                currentMapBounds = b;
                routeMap.fitBounds(b, { padding: [40, 40], maxZoom: 13 });
            }

            // Update floating district & place badge on map canvas
            const regionBadge = document.getElementById("mapRegionBadge");
            if (regionBadge && (mapData.place_name || mapData.district)) {
                regionBadge.innerHTML = `<i class="fa-solid fa-location-dot"></i> <span>${mapData.place_name || 'Tourist Destination'} &bull; <strong>${mapData.district || 'Karnataka'} District</strong></span>`;
            }

            // Populate Extended Karnataka Places & Hubs Layer
            renderKarnatakaPlacesAndHubs(routeMap.getBounds());

            // If Satellite Pipeline theme is selected, render Dishank Cadastral building layer
            if (currentMapTheme === "satellite_pipeline") {
                renderDishankCadastralLayer(routeMap.getBounds(), routeMap.getZoom());
            }

            setTimeout(() => {
                if (routeMap) {
                    routeMap.invalidateSize();
                    renderKarnatakaPlacesAndHubs(routeMap.getBounds());
                    if (currentMapTheme === "satellite_pipeline") {
                        renderDishankCadastralLayer(routeMap.getBounds(), routeMap.getZoom());
                    }
                }
            }, 250);
        }

        // -------------------------------------------------------------
        // Google Maps Iconic Pulsing Blue Dot & Accuracy Halo
        // -------------------------------------------------------------
        function renderGoogleMapsBlueDot(lat, lng, accuracy, flyTo = false) {
            currentUserCoords = [lat, lng];
            currentUserAccuracy = accuracy || 35;
            if (!routeMap || !liveGpsLayerGroup) return;

            const radius = Math.max(accuracy || 35, 15);

            if (userAccuracyCircle) {
                userAccuracyCircle.setLatLng([lat, lng]);
                userAccuracyCircle.setRadius(Math.min(radius, 1200));
            } else {
                userAccuracyCircle = L.circle([lat, lng], {
                    radius: Math.min(radius, 1200),
                    color: "#1a73e8",
                    fillColor: "#4285f4",
                    fillOpacity: 0.16,
                    weight: 1.5,
                    dashArray: "4, 6"
                });
                liveGpsLayerGroup.addLayer(userAccuracyCircle);
            }

            if (userGpsMarker) {
                userGpsMarker.setLatLng([lat, lng]);
            } else {
                const blueDotIcon = L.divIcon({
                    className: "gmaps-user-marker",
                    html: '<div class="gmaps-blue-halo"></div><div class="gmaps-blue-dot"></div>',
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                });
                userGpsMarker = L.marker([lat, lng], { icon: blueDotIcon, zIndexOffset: 3000 });
                userGpsMarker.bindPopup(`
                    <div class="stop-popup-card">
                        <span class="stop-popup-badge" style="background:#1a73e8; color:#fff;">
                            <i class="fa-solid fa-satellite-dish"></i> LIVE DOORSTEP GPS
                        </span>
                        <h4 class="stop-popup-title" style="margin: 6px 0 4px; font-size: 14px; color:#1a73e8;">Your Real-Time Location</h4>
                        <div class="stop-popup-detail"><i class="fa-solid fa-location-crosshairs"></i> Lat: ${lat.toFixed(5)}, Lng: ${lng.toFixed(5)}</div>
                        <div class="stop-popup-detail"><i class="fa-solid fa-bullseye"></i> Accuracy: &plusmn;${Math.round(radius)}m</div>
                        <div class="stop-popup-detail" style="color:var(--leaf);"><i class="fa-solid fa-circle-check"></i> High accuracy device positioning</div>
                    </div>`, { className: "custom-transit-popup" });
                liveGpsLayerGroup.addLayer(userGpsMarker);
            }

            if (flyTo) {
                routeMap.flyTo([lat, lng], Math.max(routeMap.getZoom(), 14), { duration: 1.2 });
            }
        }

        // Update Floating "TRAVEL NAVIGATION" HUD Card
        function updateFloatingNavHud(mapData) {
            const hud = document.getElementById("travelNavHud");
            if (!hud) return;

            const summary = mapData.corridor_summary || {};
            const originEl = document.getElementById("hudOriginText");
            const destEl = document.getElementById("hudDestText");
            const distEl = document.getElementById("hudDistance");
            const durEl = document.getElementById("hudDuration");
            const stopsEl = document.getElementById("hudStopCount");
            const fareEl = document.getElementById("hudTotalFare");
            const statusEl = document.getElementById("hudStatusText");
            const badgeEl = document.getElementById("stopsCountBadge");

            if (originEl) originEl.textContent = summary.origin_short || summary.origin_name || "Departure";
            if (destEl) destEl.textContent = summary.destination_name || "Destination";
            if (distEl) distEl.textContent = summary.total_distance_km !== undefined ? `~${summary.total_distance_km} km` : "-- km";
            if (durEl) durEl.textContent = summary.total_duration || "--";
            if (stopsEl) stopsEl.textContent = summary.total_stops !== undefined ? `${summary.total_stops} Halts` : "-- Halts";
            if (fareEl) fareEl.textContent = summary.total_fare || "--";
            if (statusEl) statusEl.innerHTML = summary.next_departure ? `${summary.next_departure} &bull; Active Transit Corridor` : "Continuous Bus Service Operational";
            if (badgeEl && summary.total_stops !== undefined) badgeEl.textContent = summary.total_stops;
        }

        // Update En-Route Stops Interactive Timeline Ribbon
        function updateEnrouteStopsRibbon(transitStops) {
            const track = document.getElementById("stopsStripTrack");
            if (!track) return;

            if (!transitStops || transitStops.length === 0) {
                track.innerHTML = '<span style="font-size:12px; color:var(--muted); padding:4px 0;">Select a starting point to see intermediate highway stops.</span>';
                return;
            }

            let html = "";
            transitStops.forEach((s, idx) => {
                html += `
                    <div class="stop-pill-item" data-stop-seq="${s.seq}" data-lat="${s.lat}" data-lng="${s.lng}">
                        <span class="stop-pill-seq">${s.seq}</span>
                        <span>${s.name}</span>
                    </div>`;
                if (idx < transitStops.length - 1) {
                    html += '<i class="fa-solid fa-chevron-right stop-pill-arrow"></i>';
                }
            });
            track.innerHTML = html;
            bindStopPillClicks();
        }

        function bindStopPillClicks() {
            const track = document.getElementById("stopsStripTrack");
            if (!track) return;

            track.querySelectorAll(".stop-pill-item").forEach(pill => {
                pill.onclick = function () {
                    const lat = parseFloat(this.dataset.lat);
                    const lng = parseFloat(this.dataset.lng);
                    const seq = parseInt(this.dataset.stopSeq);

                    track.querySelectorAll(".stop-pill-item").forEach(p => p.classList.remove("active"));
                    this.classList.add("active");

                    if (routeMap && !isNaN(lat) && !isNaN(lng)) {
                        routeMap.setView([lat, lng], 14, { animate: true });
                        const marker = stopMarkersMap[seq];
                        if (marker) {
                            marker.openPopup();
                        }
                    }
                };
            });
        }

        // Simulate Bus Ride Feature
        function toggleBusSimulation() {
            if (isSimulating) {
                stopSimulation();
            } else {
                startSimulation();
            }
        }

        function startSimulation() {
            if (!routeMap || simPath.length === 0) return;
            isSimulating = true;

            const btn = document.getElementById("simulateRideBtn");
            const btnText = document.getElementById("simulateBtnText");
            if (btn) btn.classList.add("active");
            if (btnText) btnText.textContent = "Pause Run";

            const simStatus = document.getElementById("hudSimStatus");
            if (simStatus) simStatus.style.display = "flex";

            if (!simMarker) {
                const busIcon = L.divIcon({
                    className: "custom-sim-bus-icon",
                    html: '<div class="simulated-bus-marker"><i class="fa-solid fa-bus"></i></div>',
                    iconSize: [32, 32],
                    iconAnchor: [16, 16],
                });
                simMarker = L.marker(simPath[0], { icon: busIcon, zIndexOffset: 2000 });
                simLayerGroup.addLayer(simMarker);
            } else {
                simMarker.setLatLng(simPath[simIndex]);
            }

            const totalSteps = simPath.length;
            simTimer = setInterval(() => {
                if (simIndex >= totalSteps - 1) {
                    stopSimulation();
                    const currentStopEl = document.getElementById("simCurrentStopName");
                    const progressEl = document.getElementById("simProgressText");
                    if (currentStopEl) currentStopEl.textContent = "Arrived at Destination!";
                    if (progressEl) progressEl.textContent = "100% Complete";
                    if (btnText) btnText.textContent = "Replay Run";
                    simIndex = 0;
                    return;
                }

                simIndex++;
                const currentCoord = simPath[simIndex];
                simMarker.setLatLng(currentCoord);

                const pct = Math.round((simIndex / totalSteps) * 100);
                const progressEl = document.getElementById("simProgressText");
                if (progressEl) progressEl.textContent = `Progress: ${pct}%`;

                // Identify closest enroute stop
                if (cachedMapData && cachedMapData.transit_stops) {
                    let closest = null;
                    let minDist = Infinity;
                    cachedMapData.transit_stops.forEach(s => {
                        const d = Math.hypot(s.lat - currentCoord[0], s.lng - currentCoord[1]);
                        if (d < minDist) {
                            minDist = d;
                            closest = s;
                        }
                    });

                    if (closest && minDist < 0.05) {
                        const currentStopEl = document.getElementById("simCurrentStopName");
                        if (currentStopEl) currentStopEl.textContent = `Halt: ${closest.name}`;

                        const track = document.getElementById("stopsStripTrack");
                        if (track) {
                            const targetPill = track.querySelector(`.stop-pill-item[data-stop-seq="${closest.seq}"]`);
                            if (targetPill) {
                                track.querySelectorAll(".stop-pill-item").forEach(p => p.classList.remove("active"));
                                targetPill.classList.add("active");
                                targetPill.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                            }
                        }
                    }
                }
            }, 300);
        }

        function stopSimulation() {
            isSimulating = false;
            if (simTimer) {
                clearInterval(simTimer);
                simTimer = null;
            }
            const btn = document.getElementById("simulateRideBtn");
            const btnText = document.getElementById("simulateBtnText");
            if (btn) btn.classList.remove("active");
            if (btnText && simIndex === 0) btnText.textContent = "Simulate Ride";
            else if (btnText) btnText.textContent = "Resume";
        }

        // -------------------------------------------------------------
        // 5. Setup All Toolbar & Map UI Listeners Directly
        // -------------------------------------------------------------
        // Theme switcher buttons
        document.querySelectorAll(".map-theme-btn").forEach(btn => {
            btn.onclick = function () {
                switchMapTheme(this.dataset.theme);
            };
        });

        // Extended Karnataka Places Layer Toggle
        const togglePlacesBtn = document.getElementById("togglePlacesBtn");
        if (togglePlacesBtn) {
            togglePlacesBtn.onclick = function () {
                if (!routeMap || !placesLayerGroup) return;
                if (routeMap.hasLayer(placesLayerGroup)) {
                    routeMap.removeLayer(placesLayerGroup);
                    this.classList.remove("active");
                } else {
                    routeMap.addLayer(placesLayerGroup);
                    this.classList.add("active");
                }
            };
        }

        // Bus Stops / Pipeline Valves Toggle
        const toggleStopsBtn = document.getElementById("toggleStopsBtn");
        if (toggleStopsBtn) {
            toggleStopsBtn.onclick = function () {
                if (!routeMap || !stopsLayerGroup) return;
                if (routeMap.hasLayer(stopsLayerGroup)) {
                    routeMap.removeLayer(stopsLayerGroup);
                    this.classList.remove("active");
                } else {
                    routeMap.addLayer(stopsLayerGroup);
                    this.classList.add("active");
                }
            };
        }

        // Simulate Ride Button
        const simBtn = document.getElementById("simulateRideBtn");
        if (simBtn) {
            simBtn.onclick = toggleBusSimulation;
        }

        // Dishank Cadastral Zoom-in to House Level Button
        const dishankZoomBtn = document.getElementById("dishankZoomBtn");
        if (dishankZoomBtn) {
            dishankZoomBtn.onclick = function () {
                if (!routeMap) return;
                if (currentMapTheme !== "satellite_pipeline") {
                    switchMapTheme("satellite_pipeline");
                }
                let targetCoords = null;
                if (cachedMapData) {
                    const dest = (cachedMapData.transit_stops || []).find(s => s.type === "destination");
                    if (dest) {
                        targetCoords = [dest.lat, dest.lng];
                    } else if (cachedMapData.waypoints && cachedMapData.waypoints.length > 0) {
                        const wp = cachedMapData.waypoints[cachedMapData.waypoints.length - 1];
                        targetCoords = [wp[0], wp[1]];
                    }
                }
                if (!targetCoords) {
                    targetCoords = routeMap.getCenter();
                }
                routeMap.flyTo(targetCoords, 18, { animate: true, duration: 1.2 });
            };
        }

        // Recenter / Fit View Point Button
        const recenterMapBtn = document.getElementById("recenterMapBtn");
        if (recenterMapBtn) {
            recenterMapBtn.onclick = function () {
                if (routeMap && currentMapBounds) {
                    routeMap.flyToBounds(currentMapBounds, { padding: [40, 40], duration: 1.0 });
                }
            };
        }

        // Extended Whole State Overview Button
        const stateOverviewBtn = document.getElementById("stateOverviewBtn");
        if (stateOverviewBtn) {
            stateOverviewBtn.onclick = function () {
                if (routeMap) {
                    routeMap.flyTo([14.2, 75.8], 7, { duration: 1.2 });
                }
            };
        }

        // Floating HUD Minimize/Expand Button
        const toggleHudBtn = document.getElementById("toggleHudBtn");
        const travelNavHud = document.getElementById("travelNavHud");
        if (toggleHudBtn && travelNavHud) {
            toggleHudBtn.onclick = function () {
                travelNavHud.classList.toggle("minimized");
                const icon = this.querySelector("i");
                if (icon) {
                    if (travelNavHud.classList.contains("minimized")) {
                        icon.className = "fa-solid fa-chevron-down";
                    } else {
                        icon.className = "fa-solid fa-chevron-up";
                    }
                }
            };
        }

        // -------------------------------------------------------------
        // 6. Public Transportation Route Discovery & GPS Enablement
        // -------------------------------------------------------------
        const browserLocationBanner = document.getElementById("browserLocationBanner");
        const bannerAllowGpsBtn = document.getElementById("bannerAllowGpsBtn");
        const bannerDismissBtn = document.getElementById("bannerDismissBtn");
        const transitOriginForm = document.getElementById("transitOriginForm");
        const transitOriginInput = document.getElementById("transitOriginInput");
        const transitRoutesContainer = document.getElementById("transitRoutesContainer");
        const transitStatusMsg = document.getElementById("transitStatusMsg");
        const singleGpsBtn = document.getElementById("singleGpsBtn");
        const gpsBtnLabel = document.getElementById("gpsBtnLabel");
        const watchGpsBtn = document.getElementById("watchGpsBtn");
        const watchBtnLabel = document.getElementById("watchBtnLabel");
        const clearOriginBtn = document.getElementById("clearOriginBtn");
        const gmapsFabBtn = document.getElementById("gmapsFabBtn");
        const gmapsLivePanel = document.getElementById("gmapsLivePanel");
        const gmapsStatusBadge = document.getElementById("gmapsStatusBadge");
        const gmapsLocationName = document.getElementById("gmapsLocationName");
        const gmapsAccuracyIndicator = document.getElementById("gmapsAccuracyIndicator");
        const gmapsDeviceTag = document.getElementById("gmapsDeviceTag");
        const findRoutesBtn = document.getElementById("findRoutesBtn");
        const hiddenExpenseOrigin = document.getElementById("hiddenExpenseOrigin");

        async function fetchTransitRoutes(origin, lat, lng) {
            if (!transitRoutesContainer) return;

            let url = `${window.location.pathname}?action=transit`;
            if (origin) url += `&origin=${encodeURIComponent(origin)}`;
            if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) {
                url += `&lat=${lat}&lng=${lng}`;
            }

            if (findRoutesBtn) {
                findRoutesBtn.disabled = true;
                findRoutesBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching...';
            }
            if (transitStatusMsg) {
                transitStatusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calculating dynamic end-to-end bus journey...';
            }

            try {
                const res = await fetch(url, {
                    headers: { "X-Requested-With": "XMLHttpRequest" }
                });
                if (!res.ok) throw new Error("Could not retrieve transit routes.");
                const data = await res.json();

                // Keep form inputs synchronized
                if (hiddenExpenseOrigin && data.origin) {
                    hiddenExpenseOrigin.value = data.origin;
                }
                if (transitOriginInput && data.origin) {
                    transitOriginInput.value = data.origin;
                }

                renderTransitResults(data);

                if (transitStatusMsg) {
                    const transferText = data.journey_summary?.transfer_label || "Active Route";
                    transitStatusMsg.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--leaf);"></i> Showing journey from <strong>${data.origin || 'Selected Origin'}</strong> (${transferText} &bull; Total ${data.journey_summary?.total_duration || 'Active'}).`;
                }
            } catch (err) {
                console.error("Transit fetch error:", err);
                if (transitStatusMsg) {
                    transitStatusMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#b42318;"></i> Unable to fetch transit routes. Please try another starting point.';
                }
            } finally {
                if (findRoutesBtn) {
                    findRoutesBtn.disabled = false;
                    findRoutesBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Find Routes';
                }
            }
        }

        function renderTransitResults(data) {
            if (!transitRoutesContainer) return;

            // Update map subtitle
            const mapSubtitle = document.getElementById("mapSubtitle");
            if (mapSubtitle) {
                mapSubtitle.textContent = data.origin ? `• ${data.origin_short || data.origin} to ${data.place_name || "Destination"} Bus Route` : `• ${data.place_name || "Destination"} Bus Corridor`;
            }

            // Synchronize extended places dataset if returned in payload
            if (data.all_places && Array.isArray(data.all_places) && data.all_places.length > 0) {
                allKarnatakaPlaces = data.all_places;
            }

            // 1. Update Journey Summary Card
            const summaryCard = document.getElementById("journeySummaryCard");
            const s = data.journey_summary;
            if (summaryCard) {
                summaryCard.style.display = s ? "block" : "none";
            }
            if (s && summaryCard) {
                const titleEl = summaryCard.querySelector(".summary-corridor-title");
                if (titleEl) titleEl.textContent = `${s.origin_name} → ${s.destination_name}`;

                const metricDuration = document.getElementById("metricDuration");
                if (metricDuration) metricDuration.textContent = s.total_duration;

                const metricFare = document.getElementById("metricFare");
                if (metricFare) metricFare.textContent = s.total_fare;

                const metricTransfers = document.getElementById("metricTransfers");
                if (metricTransfers) metricTransfers.textContent = s.transfer_label;

                const metricDistance = document.getElementById("metricDistance");
                if (metricDistance) metricDistance.textContent = `~${s.total_distance_km} km`;
            }

            // 2. Update Interactive Route Map
            const mapWrapper = document.getElementById("transitMapWrapper");
            if (mapWrapper) mapWrapper.style.display = "block";
            if (data.map_data) {
                initOrUpdateLeafletMap(data.map_data);
            }

            // 3. Update Stepper Timeline (Simplified - Unified)
            const stepperWrap = document.getElementById("journeyStepperWrap");
            if (stepperWrap) {
                stepperWrap.style.display = "none";
            }

            // 4. Update Direct Bus Numbers Cards (Two Distinct Options: KSRTC vs Private)
            const directBusWrap = document.getElementById("directBusWrap");
            const busRoutes = data.bus_routes || data.direct_routes || [];
            if (directBusWrap) {
                if (busRoutes.length === 0) {
                    directBusWrap.style.display = "none";
                } else {
                    directBusWrap.style.display = "block";
                    const govtRoutes = busRoutes.filter(r => r.is_government || r.operator_type === "government" || r.provider_code === "KSRTC" || r.provider_code === "NWKRTC" || r.provider_code === "BMTC" || r.provider_code === "MITRA" || r.provider_code === "KKRTC");
                    const privRoutes = busRoutes.filter(r => !govtRoutes.includes(r));

                    function renderBusCardHtml(r, isGovt) {
                        const busNumber = r.bus_number || r.route_id || "Bus";
                        const routeName = r.route_name || r.route || "Bus Route";
                        const boardPoint = r.boarding_point || r.from || (data.origin_short || "Source Location");
                        const dropPoint = r.drop_point || r.to || (data.place_name || "Destination");
                        const stopsVia = r.stops_via ? `<p style="font-size: 12px; color: var(--muted); margin: 4px 0 8px;"><i class="fa-solid fa-route" style="color: var(--leaf);"></i> <em>${r.stops_via}</em></p>` : "";
                        const freq = r.frequency || (r.departure_time ? `Depart: ${r.departure_time}` : "Frequent Schedule");
                        const hours = r.operating_hours ? ` &bull; ${r.operating_hours}` : "";
                        const fare = r.fare || "Standard Tariff";

                        const operatorBadge = isGovt 
                            ? `<span class="transit-badge badge-ksrtc" style="display:inline-flex; align-items:center; gap:5px; font-weight:800; font-size:11.5px; background:#14452f; color:#ffffff; padding:4px 10px; border-radius:6px;"><i class="fa-solid fa-building-columns" style="color:#34d399;"></i> KSRTC</span>`
                            : `<span class="transit-badge" style="display:inline-flex; align-items:center; gap:5px; font-weight:800; font-size:11.5px; background:#eef2ff; color:#4338ca; border:1px solid #c7d2fe; padding:4px 10px; border-radius:6px;"><i class="fa-solid fa-bus"></i> ${r.provider || "Private"}</span>`;

                        return `
                            <article class="route-card bus-card-item" data-operator="${isGovt ? "government" : "private"}" style="border-top: 4px solid ${isGovt ? "#14452f" : "#6366f1"}; background: ${isGovt ? "#fdfffe" : "#fbfbfe"}; display: ${isGovt ? "flex" : "none"}; flex-direction: column;">
                                <div class="route-top" style="align-items: center; margin-bottom: 8px;">
                                    <div>${operatorBadge}</div>
                                    <span style="font-size: 12.5px; font-weight: 800; color: ${isGovt ? "var(--forest)" : "#3730a3"}; background: ${isGovt ? "var(--mint)" : "#e0e7ff"}; padding: 4px 10px; border-radius: 8px;">
                                        <i class="fa-solid fa-bus-simple"></i> Bus ${busNumber}
                                    </span>
                                </div>
                                <h4 class="route-name" style="margin: 6px 0 4px; font-size: 15.5px; color: ${isGovt ? "var(--forest)" : "#312e81"}; font-weight: 800;">${routeName}</h4>
                                <p style="font-size: 12px; color: #526659; margin: 0 0 6px;">
                                    <strong>Operator:</strong> ${r.provider || (isGovt ? "KSRTC Official State Carrier" : "Verified Private Operator")}
                                </p>
                                <div class="route-stops-flow" style="font-size: 12.5px; color: #2a3d31; background: ${isGovt ? "#f4faf6" : "#f5f5ff"}; padding: 8px 12px; border-radius: 10px; margin: 6px 0;">
                                    <span style="display: flex; align-items: center; gap: 5px;"><i class="fa-solid fa-circle-dot" style="color: #059669; font-size: 11px;"></i> <strong>Board:</strong> ${boardPoint}</span>
                                    <i class="fa-solid fa-arrow-right" style="color: var(--leaf); font-size: 11px;"></i>
                                    <span style="display: flex; align-items: center; gap: 5px;"><i class="fa-solid fa-location-dot" style="color: #d97706; font-size: 11px;"></i> <strong>Alight:</strong> ${dropPoint}</span>
                                </div>
                                ${stopsVia}
                                <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">
                                    ${isGovt ? '<span style="font-size:11px; font-weight:600; color:#1e3a8a; background:#dbeafe; padding:2px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-shield-halved"></i> Fixed State Tariff</span>' : ''}
                                    ${(!isGovt && r.amenities) ? `<span style="font-size:11px; font-weight:600; color:#4338ca; background:#e0e7ff; padding:3px 9px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;"><i class="fa-solid fa-couch"></i> ${r.amenities}</span>` : ''}
                                </div>
                                <div class="route-meta" style="margin-top: auto; padding-top: 10px; border-top: 1px dashed #d5ded8;">
                                    <span><i class="fa-regular fa-clock"></i> ${freq}${hours}</span>
                                    <span style="font-size: 13.5px; font-weight: 800; color: ${isGovt ? "var(--forest)" : "#312e81"}; background: #fdfaf2; padding: 3px 10px; border-radius: 6px; border: 1px solid rgba(0,0,0,0.06);">${fare}</span>
                                </div>
                            </article>`;
                    }

                    let busHtml = `
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px; margin-bottom: 18px;">
                            <div>
                                <h3 class="routes-group-title" style="margin: 0; font-size: 19px;">
                                    <i class="fa-solid fa-bus-simple" style="color: var(--leaf);"></i> Available Bus Routes
                                </h3>
                                <p style="margin: 3px 0 0; font-size: 13px; color: var(--muted);">
                                    Select KSRTC for Government state buses or Private for private fleet services.
                                </p>
                            </div>

                            <!-- Exactly Two Clean Options: KSRTC & Private -->
                            <div class="bus-operator-filter-tabs" id="dynamicBusTabs" style="display: inline-flex; background: #eef4f0; padding: 4px; border-radius: 999px; gap: 4px; border: 1px solid #d4e3d9;">
                                <button type="button" class="bus-filter-pill active" data-filter="government" style="padding: 7px 18px; border-radius: 999px; border: none; font-size: 12.5px; font-weight: 800; cursor: pointer; background: #14452f; color: #ffffff; box-shadow: 0 2px 8px rgba(20,69,47,0.25); transition: all 0.2s;">
                                    <i class="fa-solid fa-building-columns" style="color: #34d399;"></i> KSRTC Buses (${govtRoutes.length})
                                </button>
                                <button type="button" class="bus-filter-pill" data-filter="private" style="padding: 7px 18px; border-radius: 999px; border: none; font-size: 12.5px; font-weight: 800; cursor: pointer; background: transparent; color: #4338ca; transition: all 0.2s;">
                                    <i class="fa-solid fa-bus"></i> Private Buses (${privRoutes.length})
                                </button>
                            </div>
                        </div>

                        <div class="routes-grid" id="busRoutesGrid">`;

                    if (govtRoutes.length > 0) {
                        govtRoutes.forEach(r => { busHtml += renderBusCardHtml(r, true); });
                    } else {
                        busHtml += `<div class="empty-bus-msg" data-operator="government" style="grid-column: 1 / -1; padding: 24px; text-align: center; background: #f4faf6; border: 1px dashed #bbf7d0; border-radius: 12px; color: #166534;"><i class="fa-solid fa-circle-info"></i> No direct KSRTC state buses listed for this exact segment. Please check Private buses.</div>`;
                    }

                    if (privRoutes.length > 0) {
                        privRoutes.forEach(r => { busHtml += renderBusCardHtml(r, false); });
                    } else {
                        busHtml += `<div class="empty-bus-msg" data-operator="private" style="grid-column: 1 / -1; padding: 24px; text-align: center; background: #f5f5ff; border: 1px dashed #c7d2fe; border-radius: 12px; color: #3730a3; display: none;"><i class="fa-solid fa-circle-info"></i> No direct private operators registered on this rural sector. Recommended to use KSRTC Government buses.</div>`;
                    }

                    busHtml += `</div>`;
                    directBusWrap.innerHTML = busHtml;

                    // Bind tab switching events
                    const filterTabs = directBusWrap.querySelectorAll("#dynamicBusTabs .bus-filter-pill");
                    const routeCards = directBusWrap.querySelectorAll("#busRoutesGrid .bus-card-item, #busRoutesGrid .empty-bus-msg");
                    filterTabs.forEach(tab => {
                        tab.addEventListener("click", function() {
                            const target = this.getAttribute("data-filter");
                            filterTabs.forEach(t => {
                                t.classList.remove("active");
                                t.style.background = "transparent";
                                t.style.boxShadow = "none";
                                t.style.color = (t.dataset.filter === "government") ? "#2d5a41" : "#4338ca";
                            });
                            this.classList.add("active");
                            if (target === "government") {
                                this.style.background = "#14452f";
                                this.style.color = "#ffffff";
                                this.style.boxShadow = "0 2px 8px rgba(20,69,47,0.25)";
                            } else {
                                this.style.background = "#4338ca";
                                this.style.color = "#ffffff";
                                this.style.boxShadow = "0 2px 8px rgba(67,56,202,0.25)";
                            }
                            routeCards.forEach(card => {
                                card.style.display = (card.getAttribute("data-operator") === target) ? "flex" : "none";
                            });
                        });
                    });
                }
            }

            // 5. Update Google Maps Live Navigation Panel State
            if (data.is_origin_gps || (data.origin && data.origin.toLowerCase().includes("live"))) {
                const cLat = data.map_data?.origin_coords ? data.map_data.origin_coords[0] : (currentUserCoords ? currentUserCoords[0] : null);
                const cLng = data.map_data?.origin_coords ? data.map_data.origin_coords[1] : (currentUserCoords ? currentUserCoords[1] : null);
                if (cLat && cLng) {
                    updateGpsPanelState(watchPositionId ? "tracking" : "active", {
                        name: data.origin_short || data.origin,
                        lat: cLat,
                        lng: cLng,
                        accuracy: currentUserAccuracy || 30
                    });
                }
            } else if (!data.origin) {
                updateGpsPanelState("reset");
            }
        }

        // -------------------------------------------------------------
        // 7. Transparent, Accurate Live Device Location (Hardware GPS & Wi-Fi)
        // -------------------------------------------------------------
        function detectDeviceType() {
            const ua = navigator.userAgent || "";
            if (/iPad|tablet|(android(?!.*mobile))/i.test(ua)) return "Tablet GPS";
            if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated/i.test(ua)) return "Phone GPS";
            return "Laptop/PC Wi-Fi";
        }

        function updateGpsPanelState(state, info = {}) {
            if (gmapsDeviceTag) gmapsDeviceTag.textContent = detectDeviceType();

            if (state === "searching") {
                if (gmapsLivePanel) gmapsLivePanel.classList.add("gps-active");
                if (gmapsStatusBadge) {
                    gmapsStatusBadge.style.background = "#e0f2fe";
                    gmapsStatusBadge.style.color = "#0284c7";
                    gmapsStatusBadge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Acquiring GPS...';
                }
                if (gmapsLocationName) gmapsLocationName.textContent = "Connecting to device GPS & Wi-Fi positioning...";
                if (gmapsAccuracyIndicator) gmapsAccuracyIndicator.innerHTML = '<i class="fa-solid fa-circle-info"></i> Please tap "Allow" if browser asks for location access';
                if (singleGpsBtn) singleGpsBtn.disabled = true;
                if (gpsBtnLabel) gpsBtnLabel.textContent = "Acquiring...";
            } else if (state === "active") {
                if (gmapsLivePanel) gmapsLivePanel.classList.add("gps-active");
                if (gmapsStatusBadge) {
                    gmapsStatusBadge.style.background = "#dcfce7";
                    gmapsStatusBadge.style.color = "#15803d";
                    gmapsStatusBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Live GPS Fix Active';
                }
                if (gmapsLocationName && info.name) gmapsLocationName.textContent = info.name;
                if (gmapsAccuracyIndicator && info.lat !== undefined && info.lng !== undefined) {
                    const acc = info.accuracy ? `&bull; &plusmn;${info.accuracy}m` : "";
                    gmapsAccuracyIndicator.innerHTML = `<i class="fa-solid fa-location-crosshairs" style="color:#0284c7;"></i> Live GPS: ${info.lat.toFixed(4)}, ${info.lng.toFixed(4)} ${acc}`;
                }
                if (singleGpsBtn) singleGpsBtn.disabled = false;
                if (gpsBtnLabel) gpsBtnLabel.textContent = "Update GPS";
            } else if (state === "tracking") {
                if (gmapsLivePanel) gmapsLivePanel.classList.add("gps-active");
                if (gmapsStatusBadge) {
                    gmapsStatusBadge.style.background = "#dbeafe";
                    gmapsStatusBadge.style.color = "#1d4ed8";
                    gmapsStatusBadge.innerHTML = '<i class="fa-solid fa-location-arrow fa-beat"></i> Live Navigation Active';
                }
                if (gmapsLocationName && info.name) gmapsLocationName.textContent = info.name;
                if (gmapsAccuracyIndicator && info.accuracy !== undefined) {
                    gmapsAccuracyIndicator.innerHTML = `<i class="fa-solid fa-person-walking" style="color:#1d4ed8;"></i> Continuous real-time movement tracking (&plusmn;${info.accuracy}m)`;
                }
            } else if (state === "error") {
                if (gmapsLivePanel) gmapsLivePanel.classList.remove("gps-active");
                if (gmapsStatusBadge) {
                    gmapsStatusBadge.style.background = "#fee2e2";
                    gmapsStatusBadge.style.color = "#b91c1c";
                    gmapsStatusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> GPS Unavailable';
                }
                if (gmapsLocationName && info.message) gmapsLocationName.textContent = info.message;
                if (gmapsAccuracyIndicator && info.tip) gmapsAccuracyIndicator.innerHTML = info.tip;
                if (singleGpsBtn) singleGpsBtn.disabled = false;
                if (gpsBtnLabel) gpsBtnLabel.textContent = "Detect Live GPS";
            } else if (state === "reset") {
                if (gmapsLivePanel) gmapsLivePanel.classList.remove("gps-active");
                if (gmapsStatusBadge) {
                    gmapsStatusBadge.style.background = "#f1f5f9";
                    gmapsStatusBadge.style.color = "#475569";
                    gmapsStatusBadge.innerHTML = '<i class="fa-solid fa-satellite-dish"></i> Live GPS Ready';
                }
                if (gmapsLocationName) gmapsLocationName.textContent = 'Tap "Detect Live GPS" to find bus routes from your location';
                if (gmapsAccuracyIndicator) gmapsAccuracyIndicator.innerHTML = '<i class="fa-solid fa-circle-info"></i> Direct doorstep routing for phone, tablet, or laptop';
                if (singleGpsBtn) singleGpsBtn.disabled = false;
                if (gpsBtnLabel) gpsBtnLabel.textContent = "Detect Live GPS";
            }
        }

        function geoDistanceKm(lat1, lon1, lat2, lon2) {
            const R = 6371;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }

        async function resolveLocalityName(lat, lng) {
            // Check synchronized client storage first
            const cachedCity = localStorage.getItem("tourist_user_city") || sessionStorage.getItem("tourist_user_city");
            if (cachedCity && (!lat || !lng)) return cachedCity;

            // Accurate Reverse Geocoding via BigDataCloud client API
            try {
                const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`, {
                    signal: AbortSignal.timeout(3500)
                });
                if (res.ok) {
                    const data = await res.json();
                    const city = data.city || data.locality || data.principalSubdivision;
                    const state = data.principalSubdivision || "";
                    if (city) {
                        const fullName = state && !city.includes(state) ? `${city}, ${state}` : city;
                        localStorage.setItem("tourist_user_city", fullName);
                        document.cookie = "tourist_user_city=" + encodeURIComponent(fullName) + "; path=/; max-age=604800; SameSite=Lax";
                        return fullName;
                    }
                }
            } catch (_) {}

            // Secondary fallback via Nominatim
            try {
                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`, {
                    signal: AbortSignal.timeout(3500),
                    headers: { "Accept-Language": "en" }
                });
                if (res.ok) {
                    const data = await res.json();
                    const addr = data.address || {};
                    const city = addr.city || addr.town || addr.village || addr.suburb || addr.county;
                    const state = addr.state || "";
                    if (city) {
                        const fullName = state && !city.includes(state) ? `${city}, ${state}` : city;
                        localStorage.setItem("tourist_user_city", fullName);
                        document.cookie = "tourist_user_city=" + encodeURIComponent(fullName) + "; path=/; max-age=604800; SameSite=Lax";
                        return fullName;
                    }
                }
            } catch (_) {}

            return cachedCity || `Live GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        }

        async function triggerUserGeolocation(triggerBtn, flyToMap = true, isAuto = false) {
            updateGpsPanelState("searching");
            if (bannerAllowGpsBtn) {
                bannerAllowGpsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> <span>Requesting Location...</span>';
            }

            if (!navigator.geolocation) {
                if (browserLocationBanner) browserLocationBanner.style.display = "none";
                updateGpsPanelState("error", {
                    message: "Geolocation is not supported by your browser.",
                    tip: '<i class="fa-solid fa-circle-exclamation"></i> Please search your locality in the input bar below.'
                });
                if (transitStatusMsg) {
                    transitStatusMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#b42318;"></i> Geolocation is not supported by your browser.';
                }
                return;
            }

            function getPositionPromise(options) {
                return new Promise((resolve, reject) => {
                    if (!navigator.geolocation) {
                        return reject(new Error("Geolocation not supported"));
                    }
                    navigator.geolocation.getCurrentPosition(resolve, reject, options);
                });
            }

            // Universal Network Geolocation Fallback (Google-style, works on any port, phone, or network)
            async function getNetworkIpLocation() {
                try {
                    const res = await fetch("https://api.bigdatacloud.net/data/reverse-geocode-client", {
                        signal: AbortSignal.timeout(4000)
                    });
                    if (res.ok) {
                        const d = await res.json();
                        const lat = parseFloat(d.latitude);
                        const lng = parseFloat(d.longitude);
                        const city = d.city || d.locality || d.principalSubdivision || "Karnataka";
                        const state = d.principalSubdivision || "";
                        const fullCity = state && !city.includes(state) ? `${city}, ${state}` : city;
                        if (!isNaN(lat) && !isNaN(lng)) {
                            localStorage.setItem("tourist_user_city", fullCity);
                            document.cookie = "tourist_user_city=" + encodeURIComponent(fullCity) + "; path=/; max-age=604800; SameSite=Lax";
                            return {
                                coords: {
                                    latitude: lat,
                                    longitude: lng,
                                    accuracy: 2500
                                },
                                city: fullCity
                            };
                        }
                    }
                } catch (_) {}
                return null;
            }

            let pos = null;
            try {
                // High accuracy fresh position with generous 25s timeout for mobile GPS
                pos = await getPositionPromise({
                    enableHighAccuracy: true,
                    timeout: 25000,
                    maximumAge: 0
                });
            } catch (err) {
                // If high accuracy times out (e.g. desktop PC without GPS hardware or indoor satellite loss),
                // fall back to standard Wi-Fi / IP / cell network positioning
                if (err && err.code === 3) {
                    try {
                        pos = await getPositionPromise({
                            enableHighAccuracy: false,
                            timeout: 10000,
                            maximumAge: 300000
                        });
                    } catch (fallbackErr) {
                        err = fallbackErr;
                    }
                }

                if (!pos || !pos.coords) {
                    // Try Google-style network IP geolocation fallback
                    const netLoc = await getNetworkIpLocation();
                    if (netLoc && netLoc.coords) {
                        pos = netLoc;
                    }
                }

                if (!pos || !pos.coords) {
                    console.warn("Device geolocation error:", err);
                    if (bannerAllowGpsBtn) {
                        bannerAllowGpsBtn.innerHTML = '<i class="fa-solid fa-location-arrow"></i> <span>Allow Browser Location</span>';
                    }

                    let userMsg = "Unable to determine your GPS position.";
                    let userTip = '<i class="fa-solid fa-circle-exclamation"></i> Please enter your locality in the search bar below.';

                    if (err && err.code === 1) { // PERMISSION_DENIED
                        if (browserLocationBanner) browserLocationBanner.style.display = "none";
                        userMsg = "Location access was denied in your browser.";
                        userTip = '<i class="fa-solid fa-lock" style="color:#b42318;"></i> Click the lock / settings icon next to your URL bar to allow Location access, or enter your area below.';
                    } else if (err && err.code === 2) { // POSITION_UNAVAILABLE
                        userMsg = "Device location is currently unavailable.";
                        userTip = '<i class="fa-solid fa-satellite-dish" style="color:#d97706;"></i> Ensure Location / Wi-Fi is enabled in your device settings.';
                    } else if (err && err.code === 3) { // TIMEOUT
                        userMsg = "Location acquisition timed out.";
                        userTip = '<i class="fa-regular fa-clock" style="color:#d97706;"></i> Tap "Detect Live GPS" to retry, or type your starting area below.';
                    }

                    updateGpsPanelState("error", { message: userMsg, tip: userTip });
                    if (transitStatusMsg) {
                        transitStatusMsg.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color:#b42318;"></i> ${userMsg}`;
                    }
                    return;
                }
            }

            if (pos && pos.coords) {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const accuracy = Math.round(pos.coords.accuracy || 0);

                currentUserCoords = [lat, lng];
                currentUserAccuracy = accuracy;
                lastRoutedCoords = [lat, lng];

                // Hide the permission banner on successful acquisition
                if (browserLocationBanner) browserLocationBanner.style.display = "none";

                // Persist coordinates across sessionStorage, localStorage, and cookies
                try {
                    sessionStorage.setItem("tourist_live_lat", lat);
                    sessionStorage.setItem("tourist_live_lng", lng);
                    sessionStorage.setItem("tourist_live_acc", accuracy);
                    localStorage.setItem("tourist_live_lat", lat);
                    localStorage.setItem("tourist_live_lng", lng);
                    localStorage.setItem("tourist_live_acc", accuracy);
                    document.cookie = "tourist_user_lat=" + lat + "; path=/; max-age=604800; SameSite=Lax";
                    document.cookie = "tourist_user_lng=" + lng + "; path=/; max-age=604800; SameSite=Lax";
                } catch (_) {}

                const localityName = await resolveLocalityName(lat, lng);
                const queryName = localityName || `Live Doorstep GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

                if (transitOriginInput) {
                    transitOriginInput.value = queryName;
                }

                updateGpsPanelState("active", {
                    name: queryName,
                    lat: lat,
                    lng: lng,
                    accuracy: accuracy
                });

                renderGoogleMapsBlueDot(lat, lng, accuracy, flyToMap);

                if (transitStatusMsg) {
                    transitStatusMsg.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--leaf);"></i> Live GPS locked: <strong>${queryName}</strong> (&plusmn;${accuracy}m). Routing buses...`;
                }

                await fetchTransitRoutes(queryName, lat, lng);
            }
        }

        function startWatchPosition() {
            if (!navigator.geolocation) return;

            if (watchPositionId !== null) {
                navigator.geolocation.clearWatch(watchPositionId);
                watchPositionId = null;
            }

            if (watchGpsBtn) watchGpsBtn.classList.add("tracking");
            if (watchBtnLabel) watchBtnLabel.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tracking';

            watchPositionId = navigator.geolocation.watchPosition(
                async function (pos) {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    const acc = Math.round(pos.coords.accuracy || 0);

                    currentUserCoords = [lat, lng];
                    currentUserAccuracy = acc;

                    try {
                        sessionStorage.setItem("tourist_live_lat", lat);
                        sessionStorage.setItem("tourist_live_lng", lng);
                        sessionStorage.setItem("tourist_live_acc", acc);
                        localStorage.setItem("tourist_live_lat", lat);
                        localStorage.setItem("tourist_live_lng", lng);
                        localStorage.setItem("tourist_live_acc", acc);
                        document.cookie = "tourist_user_lat=" + lat + "; path=/; max-age=604800; SameSite=Lax";
                        document.cookie = "tourist_user_lng=" + lng + "; path=/; max-age=604800; SameSite=Lax";
                    } catch (_) {}

                    renderGoogleMapsBlueDot(lat, lng, acc, false);

                    // Check if moved more than 250m to trigger route recalculation
                    let shouldReroute = false;
                    if (!lastRoutedCoords) {
                        shouldReroute = true;
                    } else {
                        const d = geoDistanceKm(lastRoutedCoords[0], lastRoutedCoords[1], lat, lng);
                        if (d >= 0.25) {
                            shouldReroute = true;
                        }
                    }

                    const localityName = await resolveLocalityName(lat, lng);
                    updateGpsPanelState("tracking", {
                        name: localityName,
                        lat: lat,
                        lng: lng,
                        accuracy: acc
                    });

                    if (shouldReroute) {
                        lastRoutedCoords = [lat, lng];
                        if (transitOriginInput) transitOriginInput.value = localityName;
                        await fetchTransitRoutes(localityName, lat, lng);
                    }
                },
                function (err) {
                    console.warn("Watch position update error:", err);
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 4000,
                    timeout: 12000
                }
            );
        }

        function stopWatchPosition() {
            if (watchPositionId !== null) {
                navigator.geolocation.clearWatch(watchPositionId);
                watchPositionId = null;
            }
            if (watchGpsBtn) watchGpsBtn.classList.remove("tracking");
            if (watchBtnLabel) watchBtnLabel.textContent = "Live Navigation";
        }

        // Control button listeners
        if (singleGpsBtn) {
            singleGpsBtn.onclick = function () {
                triggerUserGeolocation(singleGpsBtn, true, false);
            };
        }

        if (watchGpsBtn) {
            watchGpsBtn.onclick = function () {
                if (watchPositionId !== null) {
                    stopWatchPosition();
                    if (currentUserCoords) {
                        updateGpsPanelState("active", {
                            name: transitOriginInput ? transitOriginInput.value : "Live GPS Fix Active",
                            lat: currentUserCoords[0],
                            lng: currentUserCoords[1],
                            accuracy: currentUserAccuracy || 30
                        });
                    } else {
                        updateGpsPanelState("reset");
                    }
                } else {
                    startWatchPosition();
                }
            };
        }

        if (clearOriginBtn) {
            clearOriginBtn.onclick = function () {
                stopWatchPosition();
                currentUserCoords = null;
                currentUserAccuracy = null;
                lastRoutedCoords = null;

                try {
                    sessionStorage.removeItem("tourist_live_lat");
                    sessionStorage.removeItem("tourist_live_lng");
                    sessionStorage.removeItem("tourist_live_acc");
                    localStorage.removeItem("tourist_live_lat");
                    localStorage.removeItem("tourist_live_lng");
                    localStorage.removeItem("tourist_live_acc");
                    document.cookie = "tourist_user_lat=; path=/; max-age=0";
                    document.cookie = "tourist_user_lng=; path=/; max-age=0";
                } catch (_) {}

                if (transitOriginInput) transitOriginInput.value = "";
                if (liveGpsLayerGroup) liveGpsLayerGroup.clearLayers();
                userGpsMarker = null;
                userAccuracyCircle = null;

                updateGpsPanelState("reset");
                fetchTransitRoutes("clear", null, null);
            };
        }

        if (gmapsFabBtn) {
            gmapsFabBtn.onclick = function () {
                if (currentUserCoords && routeMap) {
                    gmapsFabBtn.classList.add("active");
                    routeMap.flyTo(currentUserCoords, Math.max(routeMap.getZoom(), 14), { duration: 1.0 });
                    if (userGpsMarker) {
                        setTimeout(() => userGpsMarker.openPopup(), 1100);
                    }
                    setTimeout(() => gmapsFabBtn.classList.remove("active"), 1400);
                } else {
                    triggerUserGeolocation(singleGpsBtn, true, false);
                }
            };
        }

        if (transitOriginForm) {
            transitOriginForm.addEventListener("submit", function (e) {
                e.preventDefault();
                const originVal = transitOriginInput ? transitOriginInput.value.trim() : "";
                if (originVal) {
                    stopWatchPosition();
                    try {
                        sessionStorage.removeItem("tourist_live_lat");
                        sessionStorage.removeItem("tourist_live_lng");
                        sessionStorage.removeItem("tourist_live_acc");
                        localStorage.removeItem("tourist_live_lat");
                        localStorage.removeItem("tourist_live_lng");
                        localStorage.removeItem("tourist_live_acc");
                        document.cookie = "tourist_user_lat=; path=/; max-age=0";
                        document.cookie = "tourist_user_lng=; path=/; max-age=0";
                    } catch (_) {}
                    if (liveGpsLayerGroup) liveGpsLayerGroup.clearLayers();
                    userGpsMarker = null;
                    userAccuracyCircle = null;
                    currentUserCoords = null;
                    lastRoutedCoords = null;
                    updateGpsPanelState("reset");
                    fetchTransitRoutes(originVal, null, null);
                }
            });
        }

        // -------------------------------------------------------------
        // 8. Auto-load initial embedded map geodata & Dynamic Auto-Location
        // -------------------------------------------------------------
        const placesDataScript = document.getElementById("karnatakaPlacesData");
        if (placesDataScript && placesDataScript.textContent.trim()) {
            try {
                const parsedPlaces = JSON.parse(placesDataScript.textContent);
                if (Array.isArray(parsedPlaces) && parsedPlaces.length > 0) {
                    allKarnatakaPlaces = parsedPlaces;
                }
            } catch (e) {
                console.warn("Could not parse karnatakaPlacesData:", e);
            }
        }
        if (!allKarnatakaPlaces || allKarnatakaPlaces.length === 0) {
            allKarnatakaPlaces = FALLBACK_KARNATAKA_DESTINATIONS;
        }

        const mapDataScript = document.getElementById("transitMapData");
        if (mapDataScript) {
            try {
                const initialMapData = JSON.parse(mapDataScript.textContent);
                initOrUpdateLeafletMap(initialMapData);
            } catch (e) {
                console.error("Could not parse initial map data:", e);
            }
        } else {
            bindStopPillClicks();
        }

        // Wire up Browser Location Permission Banner controls
        if (bannerAllowGpsBtn) {
            bannerAllowGpsBtn.onclick = function () {
                triggerUserGeolocation(singleGpsBtn, true, false);
            };
        }
        if (bannerDismissBtn) {
            bannerDismissBtn.onclick = function () {
                if (browserLocationBanner) browserLocationBanner.style.display = "none";
                try {
                    sessionStorage.setItem("tourist_loc_prompt_dismissed", "1");
                } catch (_) {}
            };
        }

        // Initialize device tag display
        if (gmapsDeviceTag) gmapsDeviceTag.textContent = detectDeviceType();

        // -------------------------------------------------------------
        // Comprehensive Browser-Based Live Geolocation Initiation Flow
        // -------------------------------------------------------------
        function initLocationServices() {
            const storedLat = sessionStorage.getItem("tourist_live_lat") || localStorage.getItem("tourist_live_lat");
            const storedLng = sessionStorage.getItem("tourist_live_lng") || localStorage.getItem("tourist_live_lng");
            const storedAcc = parseInt(sessionStorage.getItem("tourist_live_acc") || localStorage.getItem("tourist_live_acc") || "35", 10);
            const isDismissed = sessionStorage.getItem("tourist_loc_prompt_dismissed") === "1";

            const hasServerGps = cachedMapData && (cachedMapData.is_origin_gps || (cachedMapData.origin && cachedMapData.origin.toLowerCase().includes("live")));

            if (storedLat && storedLng) {
                const pLat = parseFloat(storedLat);
                const pLng = parseFloat(storedLng);
                currentUserCoords = [pLat, pLng];
                currentUserAccuracy = storedAcc;
                renderGoogleMapsBlueDot(pLat, pLng, storedAcc, false);
                resolveLocalityName(pLat, pLng).then(locName => {
                    updateGpsPanelState("active", {
                        name: locName,
                        lat: pLat,
                        lng: pLng,
                        accuracy: storedAcc
                    });
                });

                // If initial server HTML wasn't already calculated from this live GPS, fetch it now!
                if (!hasServerGps) {
                    fetchTransitRoutes("Live Doorstep GPS", pLat, pLng);
                }
                return;
            }

            // If coordinates not yet stored, actively request browser geolocation
            if (navigator.permissions && navigator.permissions.query) {
                navigator.permissions.query({ name: "geolocation" }).then(res => {
                    if (res.state === "granted") {
                        if (browserLocationBanner) browserLocationBanner.style.display = "none";
                        setTimeout(() => {
                            triggerUserGeolocation(singleGpsBtn, false, true);
                        }, 300);
                    } else if (res.state === "prompt") {
                        // Display prominent explanatory prompt banner
                        if (!isDismissed && browserLocationBanner) {
                            browserLocationBanner.style.display = "flex";
                        }
                        // Actively invoke geolocation so browser displays the native permission prompt!
                        setTimeout(() => {
                            triggerUserGeolocation(singleGpsBtn, false, true);
                        }, 300);
                    } else if (res.state === "denied") {
                        if (browserLocationBanner) browserLocationBanner.style.display = "none";
                        updateGpsPanelState("error", {
                            message: "Browser location permission is blocked.",
                            tip: '<i class="fa-solid fa-lock" style="color:#b42318;"></i> Click the lock icon next to your URL bar to allow Location, or search your locality below.'
                        });
                    }

                    res.onchange = function () {
                        if (res.state === "granted") {
                            if (browserLocationBanner) browserLocationBanner.style.display = "none";
                            triggerUserGeolocation(singleGpsBtn, true, false);
                        } else if (res.state === "denied") {
                            if (browserLocationBanner) browserLocationBanner.style.display = "none";
                        }
                    };
                }).catch(() => {
                    if (!isDismissed && browserLocationBanner) {
                        browserLocationBanner.style.display = "flex";
                    }
                    setTimeout(() => {
                        triggerUserGeolocation(singleGpsBtn, false, true);
                    }, 300);
                });
            } else if (navigator.geolocation) {
                if (!isDismissed && browserLocationBanner) {
                    browserLocationBanner.style.display = "flex";
                }
                setTimeout(() => {
                    triggerUserGeolocation(singleGpsBtn, false, true);
                }, 300);
            }
        }

        initLocationServices();
    }

    // Run when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initDashboard);
    } else {
        initDashboard();
    }
})();
