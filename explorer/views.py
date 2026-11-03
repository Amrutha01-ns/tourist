from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse

from places.models import Place, PlaceDetails
from transport_finder.services import resolve_destination_transit


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
    place = get_object_or_404(
        Place.objects.select_related("district"),
        slug=slug,
    )

    place_details = PlaceDetails.objects.filter(
        place=place
    ).first()

    param_origin = request.POST.get("origin") or request.GET.get("origin")
    session_origin = request.session.get("user_origin")
    if param_origin:
        origin = param_origin.strip()
        request.session["user_origin"] = origin
    elif session_origin:
        origin = session_origin.strip()
    else:
        origin = "Rajajinagar, Bengaluru"
    lat = request.GET.get("lat") or request.POST.get("lat")
    lng = request.GET.get("lng") or request.POST.get("lng")

    # AJAX endpoint for asynchronous transit origin updates
    if request.headers.get("x-requested-with") == "XMLHttpRequest" and request.GET.get("action") == "transit":
        transit_data = resolve_destination_transit(
            place,
            origin_name=origin,
            origin_lat=lat,
            origin_lng=lng
        )
        return JsonResponse(transit_data)

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
                    budget,
                    travellers,
                    days,
                )

        except (ValueError, TypeError):
            error = "Please enter valid numbers for your trip."

    # Resolve transit routes for the destination
    transit = resolve_destination_transit(
        place,
        origin_name=origin,
        origin_lat=lat,
        origin_lng=lng
    )

    return render(
        request,
        "explorer/dashboard.html",
        {
            "place": place,
            "place_details": place_details,
            "expense": expense,
            "error": error,
            "transit": transit,
            "origin": origin,
        },
    )


def dashboard(request):
    return render(
        request,
        "explorer/dashboard.html",
        {
            "place": None,
            "place_details": None,
            "expense": None,
            "error": None,
            "transit": None,
            "origin": None,
        },
    )
