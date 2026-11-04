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
        let currentMapBounds = null;
        let cachedMapData = null;
        let stopMarkersMap = {};

        // Simulation variables
        let isSimulating = false;
        let simTimer = null;
        let simIndex = 0;
        let simPath = [];
        let simMarker = null;

        const TILE_THEMES = {
            streets: {
                url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
                options: {
                    maxZoom: 19,
                    attribution: '&copy; Esri &mdash; National Geographic, DeLorme, NAVTEQ, USGS'
                }
            },
            transit: {
                url: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
                options: {
                    maxZoom: 19,
                    subdomains: "abc",
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, HOT'
                }
            },
            satellite: {
                url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                options: {
                    maxZoom: 19,
                    attribution: '&copy; Esri, Maxar, Earthstar Geographics'
                }
            }
        };

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

                    // Default to crystal-clear Esri World Street Map
                    const defaultCfg = TILE_THEMES.streets;
                    currentTileLayer = L.tileLayer(defaultCfg.url, defaultCfg.options).addTo(routeMap);

                    roadLayerGroup = L.layerGroup().addTo(routeMap);
                    stopsLayerGroup = L.layerGroup().addTo(routeMap);
                    pinsLayerGroup = L.layerGroup().addTo(routeMap);
                    simLayerGroup = L.layerGroup().addTo(routeMap);
                } catch (e) {
                    console.warn("Leaflet map initialization warning:", e);
                    return;
                }
            } else {
                roadLayerGroup.clearLayers();
                stopsLayerGroup.clearLayers();
                pinsLayerGroup.clearLayers();
                simLayerGroup.clearLayers();
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

            setTimeout(() => {
                if (routeMap) routeMap.invalidateSize();
            }, 250);
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
        const transitOriginForm = document.getElementById("transitOriginForm");
        const transitOriginInput = document.getElementById("transitOriginInput");
        const transitRoutesContainer = document.getElementById("transitRoutesContainer");
        const transitStatusMsg = document.getElementById("transitStatusMsg");
        const singleGpsBtn = document.getElementById("singleGpsBtn");
        const findRoutesBtn = document.getElementById("findRoutesBtn");
        const hiddenExpenseOrigin = document.getElementById("hiddenExpenseOrigin");
        const originQuickPills = document.getElementById("originQuickPills");

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

            // 5. Update Quick Pills active classes
            if (originQuickPills) {
                const pills = originQuickPills.querySelectorAll(".origin-pill-btn");
                const curOrigin = (data.origin || "").toLowerCase();
                pills.forEach(pill => {
                    const pVal = (pill.getAttribute("data-val") || "").toLowerCase();
                    if (pVal !== "gps" && curOrigin.includes(pVal)) {
                        pill.classList.add("active");
                    } else if (pVal === "gps" && data.is_origin_gps) {
                        pill.classList.add("active");
                    } else {
                        pill.classList.remove("active");
                    }
                });
            }
        }

        // -------------------------------------------------------------
        // 7. Multi-Tier Dynamic Location Detection (Browser GPS + Geolocation APIs)
        // -------------------------------------------------------------
        async function detectUserLocationViaApi() {
            // Free, fast, reliable Geolocation APIs (works on desktops, laptops, mobile)
            const apis = [
                {
                    url: "https://ipwho.is/",
                    extract: (data) => (data && data.success) ? {
                        city: data.city || data.region,
                        region: data.region || "Karnataka",
                        lat: data.latitude,
                        lng: data.longitude,
                        display: `${data.city || data.region}, ${data.region || 'Karnataka'}`
                    } : null
                },
                {
                    url: "https://ipapi.co/json/",
                    extract: (data) => (data && data.city) ? {
                        city: data.city,
                        region: data.region || "Karnataka",
                        lat: data.latitude,
                        lng: data.longitude,
                        display: `${data.city}, ${data.region || 'Karnataka'}`
                    } : null
                },
                {
                    url: "https://freeipapi.com/api/json",
                    extract: (data) => (data && data.cityName) ? {
                        city: data.cityName,
                        region: data.regionName || "Karnataka",
                        lat: data.latitude,
                        lng: data.longitude,
                        display: `${data.cityName}, ${data.regionName || 'Karnataka'}`
                    } : null
                }
            ];

            for (const api of apis) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 3500);
                    const res = await fetch(api.url, { signal: controller.signal });
                    clearTimeout(timeoutId);
                    if (res.ok) {
                        const json = await res.json();
                        const parsed = api.extract(json);
                        if (parsed && typeof parsed.lat === "number" && typeof parsed.lng === "number") {
                            return parsed;
                        }
                    }
                } catch (e) {
                    console.warn(`IP location check failed for ${api.url}:`, e.message);
                }
            }
            return null;
        }

        async function triggerUserGeolocation(triggerBtn) {
            const originalBtnHtml = triggerBtn ? triggerBtn.innerHTML : "";
            if (triggerBtn) {
                triggerBtn.disabled = true;
                triggerBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting Live Location...';
            }
            if (transitStatusMsg) {
                transitStatusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Contacting GPS & Geolocation Network...';
            }

            let lat = null, lng = null, detectedPlaceName = null;

            // 1. First, check browser device GPS (navigator.geolocation) with 5-second timeout
            if (navigator.geolocation) {
                try {
                    const pos = await new Promise((resolve) => {
                        const timer = setTimeout(() => resolve(null), 5000);
                        navigator.geolocation.getCurrentPosition(
                            p => { clearTimeout(timer); resolve(p); },
                            err => { clearTimeout(timer); resolve(null); },
                            { timeout: 5000, enableHighAccuracy: true, maximumAge: 0 }
                        );
                    });
                    if (pos && pos.coords) {
                        lat = pos.coords.latitude;
                        lng = pos.coords.longitude;
                        // Fast reverse geocoding via OpenStreetMap Nominatim
                        try {
                            const revRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14`, {
                                signal: AbortSignal.timeout(2000)
                            });
                            if (revRes.ok) {
                                const revJson = await revRes.json();
                                const addr = revJson.address || {};
                                const town = addr.suburb || addr.neighbourhood || addr.city || addr.town || addr.village || addr.county;
                                if (town) detectedPlaceName = `${town}, Karnataka`;
                            }
                        } catch (_) {}
                    }
                } catch (gpsErr) {
                    console.log("Device GPS passed:", gpsErr);
                }
            }

            // 2. If browser GPS unavailable or desktop PC with no GPS chip, use Server-Side Geolocation API
            if (!lat || !lng) {
                try {
                    if (transitStatusMsg) {
                        transitStatusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Resolving your location via ISP Geolocation Network...';
                    }
                    const sRes = await fetch(`${window.location.pathname}?action=detect_location`, {
                        headers: { "X-Requested-With": "XMLHttpRequest" }
                    });
                    if (sRes.ok) {
                        const sData = await sRes.json();
                        if (sData && sData.detected_location) {
                            lat = sData.detected_location.lat;
                            lng = sData.detected_location.lng;
                            detectedPlaceName = sData.detected_location.display || sData.detected_location.city;

                            if (transitOriginInput) {
                                transitOriginInput.value = detectedPlaceName || sData.origin;
                            }
                            if (transitStatusMsg) {
                                transitStatusMsg.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--leaf);"></i> Live location detected: <strong>${detectedPlaceName || sData.origin}</strong>. Calculating doorstep route...`;
                            }
                            renderTransitResults(sData);

                            if (triggerBtn) {
                                triggerBtn.disabled = false;
                                triggerBtn.innerHTML = originalBtnHtml;
                            }
                            return;
                        }
                    }
                } catch (srvErr) {
                    console.warn("Server geolocation call error:", srvErr);
                }
            }

            // 3. Fallback: Client-side IP APIs
            if (!lat || !lng) {
                const ipLoc = await detectUserLocationViaApi();
                if (ipLoc) {
                    lat = ipLoc.lat;
                    lng = ipLoc.lng;
                    detectedPlaceName = ipLoc.display || `${ipLoc.city}, Karnataka`;
                }
            }

            // 4. If location coordinates acquired, request dynamic route
            if (lat && lng) {
                const queryName = detectedPlaceName || `Live GPS (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
                if (transitOriginInput) transitOriginInput.value = queryName;
                if (transitStatusMsg) {
                    transitStatusMsg.innerHTML = `<i class="fa-solid fa-satellite-dish" style="color:var(--leaf);"></i> Live GPS acquired (${lat.toFixed(4)}, ${lng.toFixed(4)}). Calculating doorstep route...`;
                }
                await fetchTransitRoutes(queryName, lat, lng);
            } else {
                if (transitStatusMsg) {
                    transitStatusMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#d97706;"></i> Unable to determine GPS. Please select a starting city below or type your locality.';
                }
            }

            if (triggerBtn) {
                triggerBtn.disabled = false;
                triggerBtn.innerHTML = originalBtnHtml;
            }
        }

        if (singleGpsBtn) {
            singleGpsBtn.onclick = function () {
                triggerUserGeolocation(singleGpsBtn);
            };
        }

        const clearOriginBtn = document.getElementById("clearOriginBtn");
        if (clearOriginBtn) {
            clearOriginBtn.onclick = function () {
                if (transitOriginInput) transitOriginInput.value = "";
                if (originQuickPills) {
                    originQuickPills.querySelectorAll(".origin-pill-btn").forEach(p => p.classList.remove("active"));
                }
                fetchTransitRoutes("clear", null, null);
            };
        }

        // Quick Origin Pills Clicks
        if (originQuickPills) {
            originQuickPills.addEventListener("click", function (e) {
                const pill = e.target.closest(".origin-pill-btn");
                if (!pill) return;

                const val = pill.getAttribute("data-val");
                if (!val) return;

                originQuickPills.querySelectorAll(".origin-pill-btn").forEach(p => p.classList.remove("active"));
                pill.classList.add("active");

                if (transitOriginInput) transitOriginInput.value = val;
                fetchTransitRoutes(val, null, null);
            });
        }

        // Search Form Submit
        if (transitOriginForm) {
            transitOriginForm.addEventListener("submit", function (e) {
                e.preventDefault();
                const originVal = transitOriginInput ? transitOriginInput.value.trim() : "";
                if (originVal) {
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

        // Auto-detect real location if origin is empty or stale legacy Alanahalli
        if (transitOriginInput) {
            const curVal = (transitOriginInput.value || "").trim().toLowerCase();
            if (!curVal || curVal.includes("alanahalli")) {
                setTimeout(() => {
                    triggerUserGeolocation(singleGpsBtn);
                }, 350);
            }
        }
    }

    // Run when DOM is ready
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initDashboard);
    } else {
        initDashboard();
    }
})();
