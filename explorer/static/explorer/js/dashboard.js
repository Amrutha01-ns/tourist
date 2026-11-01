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
                results.style.transition =
                    "opacity 650ms ease, transform 650ms ease";

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
                    "margin-top:16px;padding:12px;border-radius:10px;" +
                    "background:#fff1f0;color:#b42318;line-height:1.5;";

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
            const travellers = Number(
                document.getElementById("travellersInput")?.value
            );
            const days = Number(
                document.getElementById("daysInput")?.value
            );

            if (
                !Number.isFinite(budget) ||
                budget < 1000 ||
                budget > 100000
            ) {
                showMessage("Please select a budget between ₹1,000 and ₹1,00,000.");
                return false;
            }

            if (
                !Number.isInteger(travellers) ||
                travellers < 1 ||
                travellers > 50
            ) {
                showMessage("Please enter between 1 and 50 travellers.");
                return false;
            }

            if (
                !Number.isInteger(days) ||
                days < 1 ||
                days > 30
            ) {
                showMessage("Please enter a trip duration between 1 and 30 days.");
                return false;
            }

            return true;
        }

        expenseForm.addEventListener("submit", async function (event) {
            if (event.submitter && event.submitter.getAttribute("formaction")) {
                return; // Allow Track Your Expenses button to submit normally
            }
            event.preventDefault();
            clearMessage();

            if (!validateForm()) return;

            const originalButtonContent = submitButton
                ? submitButton.innerHTML
                : "";

            if (submitButton) {
                submitButton.disabled = true;
                submitButton.innerHTML =
                    '<i class="fa-solid fa-spinner fa-spin"></i> Calculating...';
            }

            try {
                const response = await fetch(expenseForm.action || window.location.href, {
                    method: "POST",
                    body: new FormData(expenseForm),
                    credentials: "same-origin",
                    headers: {
                        "X-Requested-With": "XMLHttpRequest"
                    }
                });

                if (!response.ok) {
                    throw new Error("The server could not calculate the expenses.");
                }

                const html = await response.text();
                const parsedDocument = new DOMParser().parseFromString(
                    html,
                    "text/html"
                );

                const newResults = parsedDocument.getElementById("expenseResults");

                if (!newResults) {
                    throw new Error(
                        "No expense results were returned. Please check your inputs and try again."
                    );
                }

                const resultsContainer = getResultsContainer();
                resultsContainer.innerHTML = newResults.innerHTML;
                resultsContainer.hidden = false;

                resultsContainer.style.transition = "none";
                resultsContainer.style.opacity = "0";
                resultsContainer.style.transform = "translateY(10px)";

                void resultsContainer.offsetHeight;

                resultsContainer.style.transition =
                    "opacity 650ms ease, transform 650ms ease";

                requestAnimationFrame(function () {
                    resultsContainer.style.opacity = "1";
                    resultsContainer.style.transform = "translateY(0)";
                });

                resultsContainer.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });

            } catch (error) {
                showMessage(
                    error.message ||
                    "Unable to calculate expenses. Please try again."
                );
                console.error("Expense calculation error:", error);

            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.innerHTML = originalButtonContent;
                }
            }
        });
    }

    // -----------------------------------------
    // 4. Public Transportation Route Discovery
    // -----------------------------------------
    const transitOriginForm = document.getElementById("transitOriginForm");
    const transitOriginInput = document.getElementById("transitOriginInput");
    const transitRoutesContainer = document.getElementById("transitRoutesContainer");
    const transitStatusMsg = document.getElementById("transitStatusMsg");
    const transitGeoBtn = document.getElementById("transitGeoBtn");
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
            transitStatusMsg.textContent = "Searching available public transit routes...";
        }

        try {
            const res = await fetch(url, {
                headers: { "X-Requested-With": "XMLHttpRequest" }
            });
            if (!res.ok) throw new Error("Could not retrieve transit routes.");
            const data = await res.json();

            // Keep the selected origin synchronized with the expense form
            if (hiddenExpenseOrigin && data.origin) {
                hiddenExpenseOrigin.value = data.origin;
            }
            if (transitOriginInput && data.origin) {
                transitOriginInput.value = data.origin;
            }

            renderTransitResults(data);
            if (transitStatusMsg) {
                transitStatusMsg.textContent = `Showing routes from "${data.origin}" (${data.total_routes_found} routes identified).`;
            }
        } catch (err) {
            console.error("Transit fetch error:", err);
            if (transitStatusMsg) {
                transitStatusMsg.textContent = "Unable to fetch transit routes. Please try another starting point.";
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
        let html = "";

        if (data.travel_tip) {
            html += `
                <div style="padding: 16px 20px; background: #fdfaf2; border-left: 5px solid var(--sun); border-radius: 14px; margin-bottom: 22px;">
                    <h4 style="margin: 0 0 4px; color: var(--forest); font-size: 15px;">
                        <i class="fa-solid fa-lightbulb" style="color: var(--sun);"></i> Boarding Advice & Direct Route Tips
                    </h4>
                    <p style="margin: 0; font-size: 14px; color: var(--ink);">${data.travel_tip}</p>
                </div>`;
        }

        const busRoutes = data.bus_routes || data.direct_routes || [];
        if (busRoutes.length > 0) {
            html += `<h3 class="routes-group-title"><i class="fa-solid fa-bus"></i> Direct Available Bus Numbers & Routes (${busRoutes.length})</h3><div class="routes-grid">`;
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

                html += `
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
                        <div class="route-meta" style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--line); display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                            <span><i class="fa-regular fa-clock"></i> ${freq}${hours}</span>
                            <span style="font-size: 13px; font-weight: 700; color: var(--forest); background: #fdfaf2; padding: 2px 8px; border-radius: 6px;">${fare}</span>
                        </div>
                    </article>`;
            });
            html += `</div>`;
        }

        if (data.transfer_routes && data.transfer_routes.length > 0) {
            html += `<h3 class="routes-group-title" style="margin-top: 28px;"><i class="fa-solid fa-shuffle"></i> Connected Transfer Journeys (${data.transfer_routes.length})</h3><div class="routes-grid">`;
            data.transfer_routes.forEach(t => {
                html += `
                    <article class="transfer-card">
                        <div class="route-top">
                            <span class="transit-badge badge-ksrtc">1-Transfer Route</span>
                            <span class="transfer-divider"><i class="fa-solid fa-arrows-split-up-and-left"></i> Transfer at ${t.transfer_at || "Hub"}</span>
                        </div>
                        <div class="transfer-step">
                            <span class="transit-badge badge-ksrtc" style="font-size: 10px;">Leg 1: ${t.first_leg?.provider_code || "KSRTC"}</span>
                            <p style="margin: 4px 0; font-weight: 700; font-size: 14px;">${t.first_leg?.route || ""}</p>
                            <div class="route-stops-flow" style="font-size: 13px;">
                                <span>${t.first_leg?.from || ""}</span>
                                <i class="fa-solid fa-arrow-right" style="font-size: 11px;"></i>
                                <span>${t.first_leg?.to || ""}</span>
                            </div>
                        </div>
                        <div class="transfer-step">
                            <span class="transit-badge badge-mitra" style="font-size: 10px;">Leg 2: ${t.second_leg?.provider_code || "MITRA"}</span>
                            <p style="margin: 4px 0; font-weight: 700; font-size: 14px;">${t.second_leg?.route || ""}</p>
                            <div class="route-stops-flow" style="font-size: 13px;">
                                <span>${t.second_leg?.from || ""}</span>
                                <i class="fa-solid fa-arrow-right" style="font-size: 11px;"></i>
                                <span>${t.second_leg?.to || ""}</span>
                            </div>
                        </div>
                    </article>`;
            });
            html += `</div>`;
        }

        if (busRoutes.length === 0 && (!data.transfer_routes || data.transfer_routes.length === 0)) {
            html += `
                <div style="padding: 24px; background: var(--sand); border-radius: 16px; text-align: center; color: var(--muted); margin-top: 14px;">
                    <i class="fa-solid fa-compass" style="font-size: 26px; color: var(--leaf); margin-bottom: 8px;"></i>
                    <h4 style="margin: 6px 0; color: var(--forest);">No Direct Routes from "${data.origin}"</h4>
                    <p style="margin: 0; font-size: 14px;">
                        ${data.notes || ""} Try entering a major transit terminal like <strong>Bengaluru</strong> or <strong>Mysuru</strong>.
                    </p>
                </div>`;
        }

        transitRoutesContainer.innerHTML = html;
    }

    if (transitOriginForm) {
        transitOriginForm.addEventListener("submit", function (e) {
            e.preventDefault();
            const originVal = transitOriginInput ? transitOriginInput.value.trim() : "";
            if (originVal) {
                fetchTransitRoutes(originVal, null, null);
            }
        });
    }

    if (transitGeoBtn) {
        transitGeoBtn.addEventListener("click", function () {
            if (!navigator.geolocation) {
                alert("Geolocation is not supported by your browser.");
                return;
            }
            transitGeoBtn.disabled = true;
            transitGeoBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Getting GPS...';
            navigator.geolocation.getCurrentPosition(
                function (pos) {
                    transitGeoBtn.disabled = false;
                    transitGeoBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Use My GPS Location';
                    fetchTransitRoutes(null, pos.coords.latitude, pos.coords.longitude);
                },
                function (err) {
                    transitGeoBtn.disabled = false;
                    transitGeoBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i> Use My GPS Location';
                    alert("Unable to retrieve location: " + (err.message || "Permission denied"));
                },
                { timeout: 10000 }
            );
        });
    }
});
