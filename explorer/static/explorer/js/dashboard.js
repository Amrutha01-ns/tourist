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
        let infraLayerGroup = null;
        let currentMapBounds = null;
        let cachedMapData = null;
        let stopMarkersMap = {};

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

        // Three distinct, high-definition map views:
        // 1. Streets & Cities: Google Navigation with clear city and district typography
        // 2. Satellite Hybrid: High-resolution satellite aerial imagery WITH city, district & road overlay
        // 3. 3D Buildings & Infra: OpenStreetMap standard with 3D building outlines and civic infrastructure
        const TILE_THEMES = {
            streets: {
                name: "Streets & Cities",
                url: "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}",
                options: {
                    maxZoom: 20,
                    subdomains: ["mt0", "mt1", "mt2", "mt3"],
                    attribution: '&copy; Google Maps &mdash; Streets, Cities &amp; District Boundaries'
                }
            },
            satellite: {
                name: "Satellite Hybrid",
                url: "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
                options: {
                    maxZoom: 20,
                    subdomains: ["mt0", "mt1", "mt2", "mt3"],
                    attribution: '&copy; Google Imagery &mdash; Satellite with City, District &amp; Road Overlay'
                }
            },
            infrastructure: {
                name: "3D Buildings & Infra",
                url: "https://mt1.google.com/vt/lyrs=p&x={x}&y={y}&z={z}",
                options: {
                    maxZoom: 20,
                    subdomains: ["mt0", "mt1", "mt2", "mt3"],
                    attribution: '&copy; Google Maps &mdash; 3D Terrain, Buildings &amp; Infrastructure'
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

        function renderRegionalCityPills(bounds) {
            if (!citiesLayerGroup || !bounds) return;
            citiesLayerGroup.clearLayers();

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

            KARNATAKA_REGIONAL_HUBS.forEach(hub => {
                if (hub.lat >= minLat && hub.lat <= maxLat && hub.lng >= minLng && hub.lng <= maxLng) {
                    const icon = L.divIcon({
                        className: "city-dot-container",
                        html: `<div class="city-map-dot"></div>`,
                        iconSize: [12, 12],
                        iconAnchor: [6, 6]
                    });
                    const m = L.marker([hub.lat, hub.lng], { icon: icon, zIndexOffset: 300 });
                    m.bindTooltip(`<strong>${hub.name}</strong><span class="city-dist-subtle">(${hub.district} Dist)</span>`, {
                        direction: "top",
                        offset: [0, -6],
                        className: "google-style-city-tooltip",
                        opacity: 0.95
                    });
                    m.bindPopup(`
                        <div class="city-popup-card">
                            <span class="city-popup-tag"><i class="fa-solid fa-map-pin"></i> Karnataka Hub</span>
                            <h4 style="margin:4px 0 2px; font-size:14px; color:#14452f;">${hub.name}</h4>
                            <p style="margin:0; font-size:11.5px; color:#475569;"><strong>District:</strong> ${hub.district} &bull; Karnataka</p>
                        </div>
                    `, { className: "custom-transit-popup" });
                    citiesLayerGroup.addLayer(m);
                }
            });
        }

        function renderInfrastructureLayer(mapData) {
            if (!infraLayerGroup) return;
            infraLayerGroup.clearLayers();

            // 1. Destination Architecture & 3D Building Complex Marker
            let destPoint = null;
            const destStop = (mapData.transit_stops || []).find(s => s.type === "destination");
            if (destStop) {
                destPoint = [destStop.lat, destStop.lng];
            } else if (mapData.waypoints && mapData.waypoints.length > 0) {
                destPoint = mapData.waypoints[mapData.waypoints.length - 1];
            }

            if (destPoint) {
                const destName = mapData.place_name || "Destination Complex";
                const destDistrict = mapData.district || "Karnataka";
                const icon = L.divIcon({
                    className: "infra-marker-container",
                    html: `<div class="infra-poi-marker type-monument" title="${destName} 3D Architectural Site"><i class="fa-solid fa-landmark"></i></div>`,
                    iconSize: [36, 36],
                    iconAnchor: [18, 18]
                });
                const m = L.marker(destPoint, { icon: icon, zIndexOffset: 700 });
                m.bindPopup(`
                    <div class="infra-popup-card">
                        <span class="infra-badge-monument"><i class="fa-solid fa-building-columns"></i> 3D Heritage Architecture &amp; Monument</span>
                        <h4 style="margin:6px 0 3px; font-size:15px; color:#854d0e;">${destName}</h4>
                        <p style="margin:0 0 6px; font-size:12px; color:#334155;"><strong>Location:</strong> ${destDistrict} District &bull; Public Monument Grounds</p>
                        <div class="infra-facilities-row">
                            <span><i class="fa-solid fa-person-walking"></i> Visitor Quadrangle</span>
                            <span><i class="fa-solid fa-ticket"></i> Entry Terminal</span>
                            <span><i class="fa-solid fa-square-parking"></i> EV/Vehicle Parking</span>
                        </div>
                    </div>
                `, { className: "custom-transit-popup" });
                infraLayerGroup.addLayer(m);
            }

            // 2. Transit Terminals & Infrastructure Nodes along Corridor
            (mapData.transit_stops || []).forEach(stop => {
                if (stop.type === "origin" || stop.type === "transfer") {
                    const icon = L.divIcon({
                        className: "infra-marker-container",
                        html: `<div class="infra-poi-marker type-bus" title="${stop.name} Bus Terminal Infrastructure"><i class="fa-solid fa-bus"></i></div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    });
                    const m = L.marker([stop.lat, stop.lng], { icon: icon, zIndexOffset: 650 });
                    m.bindPopup(`
                        <div class="infra-popup-card">
                            <span class="infra-badge-bus"><i class="fa-solid fa-bus-simple"></i> Public Transit Terminal Infrastructure</span>
                            <h4 style="margin:6px 0 3px; font-size:14px; color:#14532d;">${stop.name}</h4>
                            <p style="margin:0 0 6px; font-size:12px; color:#334155;"><strong>Platform Bay:</strong> ${stop.platform || "Main Terminal Bay"} &bull; ${stop.buses || "Intercity Sarige & Express"}</p>
                            <div class="infra-facilities-row">
                                <span><i class="fa-solid fa-restroom"></i> Passenger Lounges</span>
                                <span><i class="fa-solid fa-charging-station"></i> EV Fast Charging</span>
                                <span><i class="fa-solid fa-store"></i> Refreshment Bays</span>
                            </div>
                        </div>
                    `, { className: "custom-transit-popup" });
                    infraLayerGroup.addLayer(m);
                }
            });
        }

        // Smooth Catmull-Rom Spline Curve Interpolation
        function generateCurvedPoints(coords, pointsPerSegment = 8) {
            if (!coords || coords.length < 2) return coords || [];
            if (coords.length === 2) {
                // Generate slight natural curve between 2 points
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

        function switchMapTheme(themeKey) {
            if (!routeMap || !TILE_THEMES[themeKey]) return;
            if (currentTileLayer) {
                routeMap.removeLayer(currentTileLayer);
            }
            const cfg = TILE_THEMES[themeKey];
            currentTileLayer = L.tileLayer(cfg.url, cfg.options).addTo(routeMap);
            currentTileLayer.bringToBack();

            document.querySelectorAll(".map-theme-btn").forEach(btn => {
                btn.classList.toggle("active", btn.dataset.theme === themeKey);
            });

            // Toggle 3D Infrastructure layer indicator
            const infraLegend = document.getElementById("infraLegendIndicator");
            if (infraLayerGroup) {
                if (themeKey === "infrastructure") {
                    if (!routeMap.hasLayer(infraLayerGroup)) routeMap.addLayer(infraLayerGroup);
                    if (infraLegend) infraLegend.style.display = "inline-flex";
                } else {
                    if (routeMap.hasLayer(infraLayerGroup)) routeMap.removeLayer(infraLayerGroup);
                    if (infraLegend) infraLegend.style.display = "none";
                }
            }
        }

        function initOrUpdateLeafletMap(mapData) {
            const mapCanvas = document.getElementById("transitRouteMap");
            if (!mapCanvas || typeof L === "undefined") return;
            if (!mapData || (!mapData.waypoints && !mapData.transit_stops)) return;

            cachedMapData = mapData;
            stopMarkersMap = {};

            if (!routeMap) {
                try {
                    routeMap = L.map("transitRouteMap", {
                        scrollWheelZoom: false,
                        zoomControl: true,
                    });

                    // Default to crystal-clear Google Streets & Cities Navigation
                    const defaultCfg = TILE_THEMES.streets;
                    currentTileLayer = L.tileLayer(defaultCfg.url, defaultCfg.options).addTo(routeMap);

                    roadLayerGroup = L.layerGroup().addTo(routeMap);
                    stopsLayerGroup = L.layerGroup().addTo(routeMap);
                    pinsLayerGroup = L.layerGroup().addTo(routeMap);
                    citiesLayerGroup = L.layerGroup().addTo(routeMap);
                    infraLayerGroup = L.layerGroup(); // Added to map dynamically in 'infrastructure' theme
                    simLayerGroup = L.layerGroup().addTo(routeMap);
                    liveGpsLayerGroup = L.layerGroup().addTo(routeMap);

                    // Re-calculate visible city and district pills when map moves or zooms
                    routeMap.on("moveend", () => {
                        if (routeMap) {
                            renderRegionalCityPills(routeMap.getBounds());
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
                if (citiesLayerGroup) citiesLayerGroup.clearLayers();
                if (infraLayerGroup) infraLayerGroup.clearLayers();
                simLayerGroup.clearLayers();
                if (liveGpsLayerGroup) liveGpsLayerGroup.clearLayers();
                stopSimulation();
            }

            // 1. Draw Multi-Layer Asphalt Curved Highway (Styled after user reference graphic)
            const segments = mapData.segments || [];
            const allCoords = [];
            simPath = [];

            segments.forEach(seg => {
                if (seg.coords && seg.coords.length > 0) {
                    allCoords.push(...seg.coords);

                    // Smooth the segment using spline interpolation for organic highway curvature
                    const smoothCoords = generateCurvedPoints(seg.coords, 8);
                    simPath.push(...smoothCoords);

                    const strokeColor = seg.color || "#10b981";

                    // Layer A: Soft Road Drop-Shadow / Ambient casing
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
                        weight: 12,
                        opacity: 0.9,
                        lineCap: "round",
                        lineJoin: "round",
                    });
                    roadLayerGroup.addLayer(roadBorder);

                    // Layer C: Rich Dark Asphalt Highway Roadway
                    const innerAsphalt = L.polyline(smoothCoords, {
                        color: "#1e293b",
                        weight: 8,
                        opacity: 1,
                        lineCap: "round",
                        lineJoin: "round",
                    });
                    innerAsphalt.bindTooltip(`<strong>${seg.name}</strong>`, { sticky: true });
                    roadLayerGroup.addLayer(innerAsphalt);

                    // Layer D: Crisp White Dashed Highway Centerline Divider
                    const centerStripe = L.polyline(smoothCoords, {
                        color: "#ffffff",
                        weight: 2,
                        dashArray: "8, 12",
                        opacity: 0.95,
                        lineCap: "butt",
                    });
                    roadLayerGroup.addLayer(centerStripe);
                }
            });

            // 2. Add Iconic 3D Teardrop GPS Pins (Matching user reference image)
            const waypoints = mapData.waypoints || [];
            waypoints.forEach((wp, wIdx) => {
                const lat = wp[0];
                const lng = wp[1];
                const label = wp[2] || "Transit Stop";
                const type = wp[3] || "transfer";

                let pinTypeClass = "pin-transfer";
                let innerContent = `${wIdx + 1}`;

                if (type === "origin" || wIdx === 0) {
                    pinTypeClass = "pin-origin";
                    innerContent = '<i class="fa-solid fa-location-crosshairs" style="font-size:10px;"></i>';
                } else if (type === "destination" || wIdx === waypoints.length - 1) {
                    pinTypeClass = "pin-dest";
                    innerContent = '<i class="fa-solid fa-flag-checkered" style="font-size:10px;"></i>';
                } else {
                    innerContent = '<i class="fa-solid fa-shuffle" style="font-size:9px;"></i>';
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

                const marker = L.marker([lat, lng], { icon: customPinIcon });
                marker.bindPopup(`
                    <div class="stop-popup-card">
                        <span class="stop-popup-badge ${pinTypeClass === 'pin-dest' ? 'badge-dest-stop' : (pinTypeClass === 'pin-origin' ? 'badge-origin-stop' : 'badge-transfer-stop')}">
                            ${type.toUpperCase()} STOP
                        </span>
                        <h4 class="stop-popup-title">${label}</h4>
                        <div class="stop-popup-detail"><i class="fa-solid fa-location-crosshairs"></i> GPS: ${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
                    </div>`, { className: "custom-transit-popup" });

                pinsLayerGroup.addLayer(marker);
            });

            // 3. Add Intermediate En-Route Bus Stops (Circular Stop Disc Markers)
            const transitStops = mapData.transit_stops || [];
            transitStops.forEach(s => {
                const isOriginOrDest = (s.type === "origin" || s.type === "destination");
                if (!isOriginOrDest) {
                    const stopDiscHtml = `<div class="transit-stop-marker" data-stop-seq="${s.seq}"><i class="fa-solid fa-bus"></i></div>`;
                    const stopIcon = L.divIcon({
                        className: "custom-stop-disc-icon",
                        html: stopDiscHtml,
                        iconSize: [26, 26],
                        iconAnchor: [13, 13],
                        popupAnchor: [0, -13],
                    });

                    const stopMarker = L.marker([s.lat, s.lng], { icon: stopIcon });
                    stopMarker.bindPopup(`
                        <div class="stop-popup-card">
                            <span class="stop-popup-badge badge-enroute-stop"><i class="fa-solid fa-bus"></i> ${s.type.toUpperCase().replace('_', ' ')}</span>
                            <h4 class="stop-popup-title">${s.name}</h4>
                            <div class="stop-popup-detail"><i class="fa-solid fa-signs-post"></i> <strong>Platform:</strong> ${s.platform || 'Express Bay'}</div>
                            <div class="stop-popup-detail"><i class="fa-regular fa-clock"></i> <strong>Halt:</strong> ${s.halt || '5 min halt'}</div>
                            <div class="stop-popup-detail"><i class="fa-solid fa-van-shuttle"></i> <strong>Buses:</strong> ${s.buses || 'KSRTC Express'}</div>
                            ${s.tip ? `<div class="stop-popup-tip"><i class="fa-solid fa-lightbulb"></i> ${s.tip}</div>` : ''}
                        </div>`, { className: "custom-transit-popup" });

                    stopsLayerGroup.addLayer(stopMarker);
                    stopMarkersMap[s.seq] = stopMarker;
                }
            });

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
            updateEnrouteStopsRibbon(transitStops);

            // 5. Update Map Bounds
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
                regionBadge.innerHTML = `<i class="fa-solid fa-map-location-dot"></i> <span>${mapData.place_name || 'Tourist Destination'} &bull; <strong>${mapData.district || 'Karnataka'} District</strong></span>`;
            }

            // Populate Regional City Pills and 3D Infrastructure
            renderRegionalCityPills(currentMapBounds || routeMap.getBounds());
            renderInfrastructureLayer(mapData);

            // If infrastructure theme is currently selected, ensure infraLayerGroup is displayed
            const activeThemeBtn = document.querySelector(".map-theme-btn.active");
            if (activeThemeBtn && activeThemeBtn.dataset.theme === "infrastructure") {
                if (!routeMap.hasLayer(infraLayerGroup)) routeMap.addLayer(infraLayerGroup);
            }

            setTimeout(() => {
                if (routeMap) {
                    routeMap.invalidateSize();
                    renderRegionalCityPills(routeMap.getBounds());
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

        // Bus Stops Toggle
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

        // Recenter / Fit Route Button
        const recenterMapBtn = document.getElementById("recenterMapBtn");
        if (recenterMapBtn) {
            recenterMapBtn.onclick = function () {
                if (routeMap && currentMapBounds) {
                    routeMap.fitBounds(currentMapBounds, { padding: [40, 40] });
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
                mapSubtitle.textContent = data.origin ? `• ${data.origin_short || data.origin} to ${data.place_name || "Destination"}` : `• ${data.place_name || "Destination"} Destination Map`;
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

            // 3. Update Stepper Timeline
            const stepperWrap = document.getElementById("journeyStepperWrap");
            const stepperTimeline = document.getElementById("stepperTimeline");
            const legs = data.journey_legs || [];

            if (stepperWrap && stepperTimeline) {
                if (legs.length > 0) {
                    stepperWrap.style.display = "block";
                    let stepperHtml = "";
                    legs.forEach(leg => {
                        const strokeColor = leg.stroke_color || "#14452f";
                        const badgeClass = leg.badge_class || "badge-ksrtc";
                        const stopsVia = leg.stops_via ? `<p style="font-size: 12px; color: var(--muted); margin: 4px 0 6px;"><i class="fa-solid fa-road" style="color: var(--leaf);"></i> <em>${leg.stops_via}</em></p>` : "";
                        const instructions = leg.instructions ? `<p style="font-size: 12px; color: #1e3a2b; margin: 8px 0 0; background: #f4faf6; padding: 6px 10px; border-radius: 6px;"><i class="fa-solid fa-info-circle" style="color: var(--leaf);"></i> ${leg.instructions}</p>` : "";

                        stepperHtml += `
                            <div class="stepper-leg-item">
                                <div class="stepper-node-dot" style="border-color: ${strokeColor};">
                                    ${leg.step_number}
                                </div>
                                <article class="stepper-leg-card" style="border-left: 5px solid ${strokeColor};">
                                    <div class="stepper-leg-header">
                                        <div style="display:flex; align-items:center; gap:8px;">
                                            <span class="transit-badge ${badgeClass}">${leg.provider_code || "TRANSIT"}</span>
                                            <span style="font-size: 13px; font-weight: 800; color: var(--forest); background: var(--mint); padding: 4px 10px; border-radius: 8px;">
                                                <i class="fa-solid fa-bus-simple"></i> ${leg.bus_number}
                                            </span>
                                        </div>
                                        <span style="font-size: 13px; font-weight: 700; color: var(--forest); background: #fdfaf2; padding: 3px 9px; border-radius: 6px;">
                                            ${leg.fare} &bull; ${leg.duration}
                                        </span>
                                    </div>
                                    <h4 class="stepper-leg-title">${leg.title}</h4>
                                    <div class="stepper-flow-row">
                                        <span><i class="fa-solid fa-circle-dot" style="color: #06b6d4; font-size: 11px;"></i> <strong>Board:</strong> ${leg.boarding_point}</span>
                                        <i class="fa-solid fa-arrow-right" style="color: var(--leaf); font-size: 12px;"></i>
                                        <span><i class="fa-solid fa-location-dot" style="color: #d97706; font-size: 11px;"></i> <strong>Alight:</strong> ${leg.drop_point}</span>
                                    </div>
                                    ${stopsVia}
                                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--line); flex-wrap: wrap; gap: 8px;">
                                        <span><i class="fa-regular fa-clock" style="color: var(--leaf);"></i> ${leg.departure_status || leg.frequency}</span>
                                        <span style="font-size: 11px; background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${leg.distance}</span>
                                    </div>
                                    ${instructions}
                                </article>
                            </div>`;
                    });
                    stepperTimeline.innerHTML = stepperHtml;
                } else {
                    stepperWrap.style.display = "none";
                }
            }

            // 4. Update Direct Bus Numbers Cards
            const directBusWrap = document.getElementById("directBusWrap");
            const busRoutes = data.bus_routes || data.direct_routes || [];
            if (directBusWrap && busRoutes.length > 0) {
                let busHtml = `
                    <h3 class="routes-group-title"><i class="fa-solid fa-bus"></i> Direct Available Bus Numbers & Routes (${busRoutes.length})</h3>
                    <div class="routes-grid">`;
                busRoutes.forEach(r => {
                    const badgeClass = r.provider_code === "BMTC" ? "badge-bmtc" : (r.provider_code === "MITRA" ? "badge-mitra" : (r.provider_code === "NWKRTC" ? "badge-hub" : "badge-ksrtc"));
                    const busNumber = r.bus_number || r.route_id || "Bus";
                    const routeName = r.route_name || r.route || "Bus Route";
                    const boardPoint = r.boarding_point || r.from || "";
                    const dropPoint = r.drop_point || r.to || "";
                    const stopsVia = r.stops_via ? `<p style="font-size: 12px; color: var(--muted); margin: 4px 0 8px;"><i class="fa-solid fa-route" style="color: var(--leaf);"></i> <em>${r.stops_via}</em></p>` : "";
                    const freq = r.frequency || (r.departure_time ? `Depart: ${r.departure_time}` : "Frequent Schedule");
                    const hours = r.operating_hours ? ` &bull; ${r.operating_hours}` : "";
                    const fare = r.fare || "Standard Tariff";

                    busHtml += `
                        <article class="route-card" style="border-top: 4px solid var(--leaf);">
                            <div class="route-top">
                                <span class="transit-badge ${badgeClass}">${r.provider_code || "BUS"}</span>
                                <span style="font-size: 13px; font-weight: 800; color: var(--forest); background: var(--mint); padding: 4px 12px; border-radius: 8px;">
                                    <i class="fa-solid fa-bus-simple"></i> Bus ${busNumber}
                                </span>
                            </div>
                            <h4 class="route-name" style="margin: 8px 0 4px; font-size: 16px; color: var(--forest);">${routeName}</h4>
                            <div class="route-stops-flow" style="font-size: 13px; color: #2a3d31;">
                                <span><strong>From:</strong> ${boardPoint}</span>
                                <i class="fa-solid fa-arrow-right" style="color: var(--leaf); font-size: 12px;"></i>
                                <span><strong>To:</strong> ${dropPoint}</span>
                            </div>
                            ${stopsVia}
                            <div class="route-meta">
                                <span><i class="fa-regular fa-clock"></i> ${freq}${hours}</span>
                                <span style="font-size: 13px; font-weight: 700; color: var(--forest); background: #fdfaf2; padding: 2px 8px; border-radius: 6px;">${fare}</span>
                            </div>
                        </article>`;
                });
                busHtml += `</div>`;
                directBusWrap.innerHTML = busHtml;
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
