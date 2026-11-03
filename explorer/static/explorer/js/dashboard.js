document.addEventListener("DOMContentLoaded", function () {
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
    // 4. Interactive Leaflet Route Map ("Mappings & Strikes/Lines")
    // -------------------------------------------------------------
    let routeMap = null;
    let routeLayerGroup = null;
    let currentMapBounds = null;

    function initOrUpdateLeafletMap(mapData) {
        const mapCanvas = document.getElementById("transitRouteMap");
        if (!mapCanvas || typeof L === "undefined") return;

        if (!mapData || !mapData.waypoints || mapData.waypoints.length === 0) return;

        if (!routeMap) {
            // First time initialization
            try {
                routeMap = L.map("transitRouteMap", {
                    scrollWheelZoom: false,
                    zoomControl: true,
                });

                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    maxZoom: 18,
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                }).addTo(routeMap);

                routeLayerGroup = L.layerGroup().addTo(routeMap);
            } catch (e) {
                console.warn("Leaflet map initialization warning:", e);
                return;
            }
        } else {
            routeLayerGroup.clearLayers();
        }

        // Draw segments ("strikes or lines")
        const segments = mapData.segments || [];
        const allCoords = [];

        segments.forEach(seg => {
            if (seg.coords && seg.coords.length > 0) {
                allCoords.push(...seg.coords);
                const polylineOptions = {
                    color: seg.color || "#10b981",
                    weight: 5,
                    opacity: 0.88,
                    lineJoin: "round",
                };
                if (seg.dash) {
                    polylineOptions.dashArray = seg.dash;
                }
                const polyline = L.polyline(seg.coords, polylineOptions);
                polyline.bindTooltip(`<strong>${seg.name}</strong>`, { sticky: true });
                routeLayerGroup.addLayer(polyline);
            }
        });

        // Add custom styled waypoint marker pins
        const waypoints = mapData.waypoints || [];
        waypoints.forEach(wp => {
            const lat = wp[0];
            const lng = wp[1];
            const label = wp[2] || "Stop";
            const type = wp[3] || "transfer";

            let pinClass = "pin-transfer";
            let iconClass = "fa-arrows-split-up-and-left";
            if (type === "origin") {
                pinClass = "pin-origin";
                iconClass = "fa-location-dot";
            } else if (type === "destination") {
                pinClass = "pin-dest";
                iconClass = "fa-flag-checkered";
            }

            const customIcon = L.divIcon({
                className: "custom-leaflet-div-icon",
                html: `<div class="leaflet-custom-marker ${pinClass}"><i class="fa-solid ${iconClass}"></i></div>`,
                iconSize: [34, 34],
                iconAnchor: [17, 17],
            });

            const marker = L.marker([lat, lng], { icon: customIcon });
            marker.bindPopup(`<strong style="font-size:14px; color:#14452f;">${label}</strong><br><span style="font-size:12px; color:#66756c;">${type.toUpperCase()} STOP</span>`);
            routeLayerGroup.addLayer(marker);
        });

        // Set or update map bounds
        if (mapData.bounds && mapData.bounds.length === 2) {
            currentMapBounds = mapData.bounds;
            routeMap.fitBounds(mapData.bounds, { padding: [35, 35], maxZoom: 14 });
        } else if (allCoords.length > 0) {
            const b = L.latLngBounds(allCoords);
            currentMapBounds = b;
            routeMap.fitBounds(b, { padding: [35, 35], maxZoom: 14 });
        }

        setTimeout(() => {
            if (routeMap) routeMap.invalidateSize();
        }, 300);
    }

    // Recenter map button
    const recenterMapBtn = document.getElementById("recenterMapBtn");
    if (recenterMapBtn) {
        recenterMapBtn.addEventListener("click", function () {
            if (routeMap && currentMapBounds) {
                routeMap.fitBounds(currentMapBounds, { padding: [35, 35] });
            }
        });
    }

    // Try initializing map from embedded JSON script if present
    const mapDataScript = document.getElementById("transitMapData");
    if (mapDataScript) {
        try {
            const initialMapData = JSON.parse(mapDataScript.textContent);
            initOrUpdateLeafletMap(initialMapData);
        } catch (e) {
            console.error("Could not parse initial map data:", e);
        }
    }

    // -------------------------------------------------------------
    // 5. Public Transportation Route Discovery & GPS Enablement
    // -------------------------------------------------------------
    const transitOriginForm = document.getElementById("transitOriginForm");
    const transitOriginInput = document.getElementById("transitOriginInput");
    const transitRoutesContainer = document.getElementById("transitRoutesContainer");
    const transitStatusMsg = document.getElementById("transitStatusMsg");
    const transitGeoBtn = document.getElementById("transitGeoBtn");
    const enableGpsMainBtn = document.getElementById("enableGpsMainBtn");
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

            // Keep the selected origin synchronized with form inputs
            if (hiddenExpenseOrigin && data.origin) {
                hiddenExpenseOrigin.value = data.origin;
            }
            if (transitOriginInput && data.origin) {
                transitOriginInput.value = data.origin;
            }

            renderTransitResults(data);

            if (transitStatusMsg) {
                const transferText = data.journey_summary?.transfer_label || "Active Route";
                transitStatusMsg.innerHTML = `<i class="fa-solid fa-circle-check" style="color:var(--leaf);"></i> Showing journey from <strong>${data.origin}</strong> (${transferText} &bull; Total ${data.journey_summary?.total_duration || 'Active'}).`;
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

        // 1. Update Journey Summary Card
        const summaryCard = document.getElementById("journeySummaryCard");
        const s = data.journey_summary;
        if (s && summaryCard) {
            summaryCard.style.display = "block";
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

        // 3. Update Stepper Timeline ("Strikes & Lines")
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
        if (directBusWrap) {
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
    // 6. User Geolocation Auto-Detection & Quick Origin Switchers
    // -------------------------------------------------------------
    function triggerUserGeolocation(triggerBtn) {
        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser. Please select or enter your locality.");
            return;
        }

        const originalBtnHtml = triggerBtn ? triggerBtn.innerHTML : "";
        if (triggerBtn) {
            triggerBtn.disabled = true;
            triggerBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Detecting GPS Location...';
        }
        if (transitStatusMsg) {
            transitStatusMsg.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Acquiring accurate satellite GPS position...';
        }

        navigator.geolocation.getCurrentPosition(
            function (pos) {
                if (triggerBtn) {
                    triggerBtn.disabled = false;
                    triggerBtn.innerHTML = originalBtnHtml;
                }
                if (transitStatusMsg) {
                    transitStatusMsg.innerHTML = `<i class="fa-solid fa-satellite-dish" style="color:var(--leaf);"></i> Live GPS position acquired (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}). Planning doorstep transit...`;
                }
                fetchTransitRoutes(null, pos.coords.latitude, pos.coords.longitude);
            },
            function (err) {
                if (triggerBtn) {
                    triggerBtn.disabled = false;
                    triggerBtn.innerHTML = originalBtnHtml;
                }
                console.warn("Geolocation warning:", err.message);
                if (transitStatusMsg) {
                    transitStatusMsg.innerHTML = '<i class="fa-solid fa-circle-info" style="color:var(--sun);"></i> Browser GPS timed out or access denied. Switched to Alanahalli, Mysuru.';
                }
                fetchTransitRoutes("Alanahalli, Mysuru", null, null);
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
    }

    if (enableGpsMainBtn) {
        enableGpsMainBtn.addEventListener("click", function () {
            triggerUserGeolocation(enableGpsMainBtn);
        });
    }

    if (transitGeoBtn) {
        transitGeoBtn.addEventListener("click", function () {
            triggerUserGeolocation(transitGeoBtn);
        });
    }

    // Quick Origin Pills Clicks
    if (originQuickPills) {
        originQuickPills.addEventListener("click", function (e) {
            const pill = e.target.closest(".origin-pill-btn");
            if (!pill) return;

            const isGps = pill.getAttribute("data-is-gps") === "true";
            const val = pill.getAttribute("data-val");

            // Update active pill UI
            originQuickPills.querySelectorAll(".origin-pill-btn").forEach(p => p.classList.remove("active"));
            pill.classList.add("active");

            if (isGps) {
                triggerUserGeolocation(pill);
            } else if (val) {
                if (transitOriginInput) transitOriginInput.value = val;
                fetchTransitRoutes(val, null, null);
            }
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
});
