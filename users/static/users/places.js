const seeMoreButtons = document.querySelectorAll(".see-more-btn");

seeMoreButtons.forEach(function (button) {
    button.addEventListener("click", function () {

        const card = button.closest(".place-card");

        card.classList.toggle("active");

        if (card.classList.contains("active")) {
            button.innerHTML = `See Less <span>↑</span>`;
        } else {
            button.innerHTML = `See More <span>→</span>`;
        }

    });
});