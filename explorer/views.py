import json
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

    lat_raw = request.GET.get("lat") or request.POST.get("lat")
    lng_raw = request.GET.get("lng") or request.POST.get("lng")
    param_origin = request.POST.get("origin") or request.GET.get("origin")
    clear_origin = request.GET.get("clear_origin") or request.POST.get("clear_origin")
    session_origin = request.session.get("user_origin")
    session_lat = request.session.get("user_lat")
    session_lng = request.session.get("user_lng")

    # Parse coordinates if valid numbers
    lat = None
    lng = None
    if lat_raw and lng_raw:
        try:
            lat = float(lat_raw)
            lng = float(lng_raw)
        except (ValueError, TypeError):
            lat = None
            lng = None

    # Handle Reset / Clear
    if clear_origin or (param_origin and param_origin.strip().lower() in ("clear", "reset", "none")):
        request.session.pop("user_origin", None)
        request.session.pop("user_lat", None)
        request.session.pop("user_lng", None)
        origin = None
        lat = None
        lng = None
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            transit_data = resolve_destination_transit(place, origin_name=None, origin_lat=None, origin_lng=None)
            return JsonResponse(transit_data)
    elif lat is not None and lng is not None:
        # Live Device GPS received
        origin = param_origin.strip() if param_origin else None
        request.session["user_lat"] = lat
        request.session["user_lng"] = lng
        if origin:
            request.session["user_origin"] = origin
    elif param_origin:
        origin = param_origin.strip()
        request.session["user_origin"] = origin
        # Named text origin overrides previous GPS coordinates
        request.session.pop("user_lat", None)
        request.session.pop("user_lng", None)
    elif session_lat is not None and session_lng is not None:
        lat = session_lat
        lng = session_lng
        origin = session_origin
    elif session_origin:
        origin = session_origin.strip()
    else:
        # Default destination view (user can click 1-tap live GPS or quick origin pills)
        origin = None

    # AJAX endpoint for asynchronous transit origin updates
    if request.headers.get("x-requested-with") == "XMLHttpRequest" and (request.GET.get("action") == "transit" or request.GET.get("action") == "detect_location"):
        transit_data = resolve_destination_transit(
            place,
            origin_name=origin,
            origin_lat=lat,
            origin_lng=lng
        )
        if transit_data.get("origin"):
            request.session["user_origin"] = transit_data["origin"]
        if lat is not None and lng is not None:
            request.session["user_lat"] = lat
            request.session["user_lng"] = lng
            transit_data["is_origin_gps"] = True
            transit_data["detected_coords"] = [lat, lng]
            if "map_data" in transit_data:
                transit_data["map_data"]["is_origin_gps"] = True
                transit_data["map_data"]["origin_coords"] = [lat, lng]
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
    if lat is not None and lng is not None and isinstance(transit, dict):
        transit["is_origin_gps"] = True
        transit["detected_coords"] = [lat, lng]
        if "map_data" in transit and isinstance(transit["map_data"], dict):
            transit["map_data"]["is_origin_gps"] = True
            transit["map_data"]["origin_coords"] = [lat, lng]

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
        },
    )
