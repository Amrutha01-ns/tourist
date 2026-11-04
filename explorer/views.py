import json
import urllib.request
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


def detect_server_location():
    """
    Server-side IP location detection.
    Bypasses all client-side CORS, AdBlockers, and hardware GPS limitations.
    """
    apis = [
        "https://ipwho.is/",
        "https://ipapi.co/json/",
        "https://freeipapi.com/api/json",
    ]
    for api in apis:
        try:
            req = urllib.request.Request(
                api,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            )
            res = urllib.request.urlopen(req, timeout=3)
            data = json.loads(res.read().decode("utf-8"))
            city = data.get("city") or data.get("cityName")
            region = data.get("region") or data.get("regionName") or "Karnataka"
            lat = data.get("latitude") or data.get("lat")
            lng = data.get("longitude") or data.get("lon")
            if city and lat and lng:
                return {
                    "city": str(city),
                    "region": str(region),
                    "lat": float(lat),
                    "lng": float(lng),
                    "display": f"{city}, {region}",
                }
        except Exception:
            continue

    # Fallback to Bengaluru
    return {
        "city": "Bengaluru",
        "region": "Karnataka",
        "lat": 12.9716,
        "lng": 77.5946,
        "display": "Bengaluru, Karnataka",
    }


def place_detail(request, slug):
    place = get_object_or_404(
        Place.objects.select_related("district"),
        slug=slug,
    )

    place_details = PlaceDetails.objects.filter(
        place=place
    ).first()

    lat = request.GET.get("lat") or request.POST.get("lat")
    lng = request.GET.get("lng") or request.POST.get("lng")
    param_origin = request.POST.get("origin") or request.GET.get("origin")
    clear_origin = request.GET.get("clear_origin") or request.POST.get("clear_origin")
    session_origin = request.session.get("user_origin")

    # Automatically purge stale legacy 'Alanahalli' from session if not explicitly requested
    if session_origin and "alanahalli" in session_origin.lower() and not param_origin:
        if "user_origin" in request.session:
            del request.session["user_origin"]
        session_origin = None

    # Dedicated action: Server-Side Live Location Detection
    if request.headers.get("x-requested-with") == "XMLHttpRequest" and request.GET.get("action") == "detect_location":
        detected = detect_server_location()
        transit_data = resolve_destination_transit(
            place,
            origin_name=detected["display"],
            origin_lat=detected["lat"],
            origin_lng=detected["lng"],
        )
        if transit_data.get("origin"):
            request.session["user_origin"] = transit_data["origin"]
        transit_data["detected_location"] = detected
        return JsonResponse(transit_data)

    if clear_origin or (param_origin and param_origin.strip().lower() in ("clear", "reset", "none")):
        if "user_origin" in request.session:
            del request.session["user_origin"]
        origin = "Bengaluru"
        session_origin = None
    elif param_origin:
        origin = param_origin.strip()
        request.session["user_origin"] = origin
    elif lat and lng:
        origin = param_origin.strip() if param_origin else None
    elif session_origin:
        origin = session_origin.strip()
    else:
        # Default to Karnataka capital & transit hub so the map is NEVER blank or showing 1 pin!
        origin = "Bengaluru"

    # AJAX endpoint for asynchronous transit origin updates
    if request.headers.get("x-requested-with") == "XMLHttpRequest" and request.GET.get("action") == "transit":
        transit_data = resolve_destination_transit(
            place,
            origin_name=origin,
            origin_lat=lat,
            origin_lng=lng
        )
        if transit_data.get("origin"):
            request.session["user_origin"] = transit_data["origin"]
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
        },
    )
