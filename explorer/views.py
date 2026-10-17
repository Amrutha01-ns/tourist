
from django.shortcuts import render, get_object_or_404
from places.models import Place


def calculate_expense(budget, travellers, days):
    food = travellers * days * 300
    stay = travellers * days * 500
    transport = travellers * 200
    activities = travellers * days * 100

    total = food + stay + transport + activities
    remaining = budget - total

    return {
        "food": food,
        "stay": stay,
        "transport": transport,
        "activities": activities,
        "total": total,
        "remaining": remaining,
    }


def place_detail(request, slug):
    place = get_object_or_404(Place, slug=slug)

    expense = None
    error = None

    if request.method == "POST":
        try:
            budget = int(request.POST.get("budget", 10000))
            travellers = int(request.POST.get("travellers", 1))
            days = int(request.POST.get("days", 1))

            if not 1000 <= budget <= 100000:
                error = "Budget must be between ₹1,000 and ₹1,00,000."
            elif not 1 <= travellers <= 50:
                error = "Travellers must be between 1 and 50."
            elif not 1 <= days <= 30:
                error = "Trip duration must be between 1 and 30 days."
            else:
                expense = calculate_expense(
                    budget, travellers, days
                )

        except (ValueError, TypeError):
            error = "Please enter valid numbers for your trip."

    return render(
        request,
        "explorer/dashboard.html",
        {
            "place": place,
            "expense": expense,
            "error": error,
        },
    )


def dashboard(request):
    return render(
        request,
        "explorer/dashboard.html",
        {
            "place": None,
            "expense": None,
            "error": None,
        },
    )
