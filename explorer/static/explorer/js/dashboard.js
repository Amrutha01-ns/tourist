
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
    // 3. Browser location permission
    // -----------------------------------------
    const locationButton = document.getElementById("locationButton");
    const locationStatus = document.getElementById("locationStatus");
    if (locationButton && locationStatus) {
        locationButton.addEventListener("click", function () {
            if (!navigator.geolocation) {
                locationStatus.textContent =
                    "Location is not supported by this browser.";
                return;
            }
            if (!window.isSecureContext) {
                locationStatus.textContent =
                    "Location access requires HTTPS or localhost.";
                return;
            }
            locationButton.disabled = true;
            locationButton.textContent = "Requesting location...";
            locationStatus.textContent =
                "Please allow location access in your browser's permission popup.";
            navigator.geolocation.getCurrentPosition(
                function (position) {
                    const latitude = position.coords.latitude;
                    const longitude = position.coords.longitude;
                    locationStatus.textContent =
                        "Your location is enabled. Latitude: " +
                        latitude.toFixed(5) +
                        ", Longitude: " +
                        longitude.toFixed(5);
                    locationButton.textContent = "Location enabled";
                    locationButton.disabled = false;
                    console.log("Latitude:", latitude);
                    console.log("Longitude:", longitude);
                },
                function (error) {
                    const messages = {
                        1: "Location permission denied. Allow location access using the browser's site settings, then try again.",
                        2: "Your location could not be determined. Check your device's location services and try again.",
                        3: "The location request timed out. Please try again."
                    };
                    locationStatus.textContent =
                        messages[error.code] ||
                        "Unable to access your location.";
                    locationButton.textContent = "Try again";
                    locationButton.disabled = false;
                },
                {
                    enableHighAccuracy: false,
                    timeout: 15000,
                    maximumAge: 0
                }
            );
        });
    }

    // -----------------------------------------
    // 4. Expense form validation and AJAX submit
    // -----------------------------------------
    const expenseForm = document.getElementById("expenseForm");
    const planner = document.querySelector(".planner");

    if (!expenseForm || !planner) return;

    const submitButton = expenseForm.querySelector('button[type="submit"]');

    // Reuse an existing results section, or create a location for it.
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
            // Submit the existing form, including its Django CSRF token.
            // Django returns the rendered page; we extract only the results.
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

            // Replace the previous estimate with the newly calculated one.
            resultsContainer.innerHTML = newResults.innerHTML;
            resultsContainer.hidden = false;

            // Fade out any previous result, then fade in the updated result.
            resultsContainer.style.transition = "none";
            resultsContainer.style.opacity = "0";
            resultsContainer.style.transform = "translateY(10px)";

            // Apply the initial styles before starting the transition.
            void resultsContainer.offsetHeight;

            resultsContainer.style.transition =
                "opacity 650ms ease, transform 650ms ease";

            requestAnimationFrame(function () {
                resultsContainer.style.opacity = "1";
                resultsContainer.style.transform = "translateY(0)";
            });

            // Keep the results visible without reloading the page.
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
});
