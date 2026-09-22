/* ================================
   LOCATION
================================ */
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
/* ================================
   BUDGET
================================ */
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
/* ================================
   TRAVELLERS
================================ */
const travellersInput =
    document.getElementById("travellersInput");
const decreaseTravellers =
    document.getElementById("decreaseTravellers");
const increaseTravellers =
    document.getElementById("increaseTravellers");
if (
    travellersInput &&
    decreaseTravellers &&
    increaseTravellers
) {
    decreaseTravellers.addEventListener("click", () => {
        const value =
            parseInt(travellersInput.value, 10);
        if (value > 1) {
            travellersInput.value =
                value - 1;
        }
    });
    increaseTravellers.addEventListener("click", () => {
        const value =
            parseInt(travellersInput.value, 10);
        if (value < 50) {
            travellersInput.value =
                value + 1;
        }
    });
}
/* ================================
   DAYS
================================ */
const daysInput =
    document.getElementById("daysInput");
const decreaseDays =
    document.getElementById("decreaseDays");
const increaseDays =
    document.getElementById("increaseDays");
if (
    daysInput &&
    decreaseDays &&
    increaseDays
) {
    decreaseDays.addEventListener("click", () => {
        const value =
            parseInt(daysInput.value, 10);
        if (value > 1) {
            daysInput.value =
                value - 1;
        }
    });
    increaseDays.addEventListener("click", () => {
        const value =
            parseInt(daysInput.value, 10);
        if (value < 30) {
            daysInput.value =
                value + 1;
        }
    });
}
/* ================================
   CSRF helper (Django)
================================ */
function getCookie(name) {
    const match = document.cookie.match(
        new RegExp("(^| )" + name + "=([^;]+)")
    );
    return match ? decodeURIComponent(match[2]) : null;
}
/* ================================
   PLAN / ESTIMATE
================================ */
const exploreButton =
    document.querySelector('.explore-button');
const destinationInput =
    document.getElementById('destinationInput');

exploreButton.addEventListener('click', async () => {
    const destination = destinationInput.value.trim();

    if (!destination) {
        destinationInput.focus();
        destinationInput.placeholder = "Please tell us where you're headed";
        return;
    }

    const payload = {
        city: destination,
        travellers: parseInt(travellersInput.value, 10),
        days: parseInt(daysInput.value, 10),
        budget: parseInt(budgetSlider.value, 10)
    };

    exploreButton.disabled = true;

    try {
        const response = await fetch('/engine/plan/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken')
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody.error || `Request failed (${response.status})`);
        }

        const result = await response.json();

        if (!result.valid) {
            alert(`${result.message} You need ₹${result.estimated_total}, but entered ₹${result.entered_budget}. Short by ₹${result.shortfall}.`);
            return;
        }

        alert(`Great! Estimated cost: ₹${result.estimated_total}. You have ₹${result.surplus} to spare.`);
    } catch (err) {
        alert("Something went wrong getting your estimate. Please try again.");
        console.error(err);
    } finally {
        exploreButton.disabled = false;
    }
});