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
    if request.method == "POST":
        budget = int(request.POST.get("budget", 0))
        travellers = int(request.POST.get("travellers", 1))
        days = int(request.POST.get("days", 1))

        expense = calculate_expense(
            budget,
            travellers,
            days
        )
    return render(
        request,
        "explorer/dashboard.html",
        {
            "place": place,
            "expense": expense,
        }
    )
def dashboard(request):
    return render(request, "explorer/dashboard.html")