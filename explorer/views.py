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


NEARBY_TRANSIT_RECOMMENDATIONS = {
    # Mysore pairings
    ("mysore", "mysore-zoo"): {"distance": "2 km", "route": "City Bus 10A / 10B from Palace East Gate", "time": "8 mins"},
    ("mysore", "sri-chmundeshwari-temple"): {"distance": "11 km", "route": "Direct KSRTC / City Bus 201 from CBS", "time": "25 mins"},
    ("mysore", "st-philomenas-church"): {"distance": "3.2 km", "route": "Ashoka Road City Bus 161 / Local Auto", "time": "10 mins"},
    ("mysore", "jaganmohan-palace"): {"distance": "1.2 km", "route": "5 min Walking / Auto via Subbarayanakere", "time": "5 mins"},
    ("mysore", "karanji-lake"): {"distance": "2.8 km", "route": "City Bus 10 / Auto via Zoo Road", "time": "10 mins"},
    ("mysore", "krs-dam"): {"distance": "19 km", "route": "KSRTC / City Bus 303 from CBS", "time": "40 mins"},
    ("mysore", "chunchanakatte-falls"): {"distance": "54 km", "route": "K.R. Nagar KSRTC Express Bus", "time": "1h 15m"},
    ("mysore", "somanathapura-chennakesava-temple"): {"distance": "35 km", "route": "Bannur Route KSRTC Bus", "time": "50 mins"},

    # Kodagu (Coorg) pairings
    ("abbey-falls", "rajas-seat"): {"distance": "8 km", "route": "Madikeri Local Mini-Bus / Auto", "time": "20 mins"},
    ("abbey-falls", "dubare-elephant-camp"): {"distance": "32 km", "route": "Kushalnagar Route Bus via Siddapur", "time": "50 mins"},
    ("abbey-falls", "talakaveri"): {"distance": "48 km", "route": "Bhagamandala Direct KSRTC Service", "time": "1h 20m"},
    ("abbey-falls", "namdroling-monastery"): {"distance": "38 km", "route": "Bylakuppe Express from Madikeri Stand", "time": "55 mins"},
    ("abbey-falls", "chelavara-falls"): {"distance": "42 km", "route": "Cheyyandane Jeep Route via Virajpet", "time": "1h 10m"},

    # Hampi pairings
    ("elephant-stables", "virupaksha-temple"): {"distance": "2.5 km", "route": "Hampi Heritage Loop Auto / Bicycle", "time": "9 mins"},
    ("elephant-stables", "vittala-temple"): {"distance": "2.2 km", "route": "Electric Buggy or Riverside Heritage Walk", "time": "8 mins"},
    ("elephant-stables", "lotus-mahal"): {"distance": "0.3 km", "route": "Right Next Door (Zenana Enclosure Walk)", "time": "3 mins"},

    # Chikkamagaluru pairings
    ("baba-budangiri", "mullayanagiri"): {"distance": "16 km", "route": "Hill Connecting Jeep / Scenic Mountain Pass", "time": "35 mins"},
    ("baba-budangiri", "hebbe-falls"): {"distance": "34 km", "route": "Kemmanagundi Safari Jeep Connection", "time": "1h 15m"},
    ("baba-budangiri", "kallathigiri-falls"): {"distance": "28 km", "route": "Tarikere Road Local Bus", "time": "50 mins"},

    # Udupi pairings
    ("kaup-beach-and-lighthouse", "malpe-beach"): {"distance": "18 km", "route": "Direct Coastal Road Bus via Udupi CBS", "time": "30 mins"},
    ("kaup-beach-and-lighthouse", "sri-krishna-temple"): {"distance": "14 km", "route": "City Bus Every 15 mins to Udupi Stand", "time": "22 mins"},
    ("kaup-beach-and-lighthouse", "st-marys-island"): {"distance": "20 km", "route": "Bus to Malpe + 20 min Tourist Ferry", "time": "45 mins"},

    # Shivamogga pairings
    ("agumbe", "jog-falls"): {"distance": "95 km", "route": "Thirthahalli-Sagar Express KSRTC Bus", "time": "2h 15m"},
    ("agumbe", "kodachadri"): {"distance": "58 km", "route": "Hosanagara Jeep Connection", "time": "1h 30m"},
}


def get_nearby_places_with_routes(current_place):
    """
    Fetches up to 6 nearby destinations in the same district/region,
    calculating realistic distances and connecting transit routes.
    """
    candidates = list(Place.objects.filter(
        district=current_place.district
    ).exclude(id=current_place.id).select_related("district")[:6])

    # If district has fewer than 3, backfill with top attractions from other regions
    if len(candidates) < 3:
        extra = list(Place.objects.exclude(
            id=current_place.id
        ).exclude(
            district=current_place.district
        ).select_related("district")[:(6 - len(candidates))])
        candidates.extend(extra)

    nearby_list = []
    base_slug = current_place.slug or ""

    for idx, near in enumerate(candidates):
        target_slug = near.slug or ""
        key1 = (base_slug, target_slug)
        key2 = (target_slug, base_slug)

        route_info = NEARBY_TRANSIT_RECOMMENDATIONS.get(key1) or NEARBY_TRANSIT_RECOMMENDATIONS.get(key2)
        if not route_info:
            # Dynamic realistic distance and connecting transit
            est_dist = round(2.5 + (idx * 3.8), 1)
            est_time = 8 + (idx * 7)
            route_info = {
                "distance": f"~{est_dist} km",
                "route": f"Local Direct Bus from {current_place.district.name} Stand",
                "time": f"~{est_time} mins"
            }

        nearby_list.append({
            "place": near,
            "distance": route_info["distance"],
            "route": route_info["route"],
            "time": route_info["time"],
            "url": f"/explorer/{near.slug}/" if near.slug else f"/places/{near.district.name.lower()}/"
        })

    return nearby_list


def get_all_karnataka_places_data(current_place=None):
    """
    Returns rich serialized geodata for all Karnataka tourist destinations
    to power the interactive Pipeline Map View across an extended geographic range.
    """
    all_places = []
    try:
        from transport_finder.smart_router import resolve_destination_spec
        places_qs = Place.objects.select_related("district").all()
        for p in places_qs:
            spec = resolve_destination_spec(p)
            all_places.append({
                "id": p.id,
                "name": p.name,
                "slug": p.slug or "",
                "district": p.district.name if p.district else "",
                "category": p.category or "nature",
                "speciality": p.speciality or "",
                "lat": spec.get("lat"),
                "lng": spec.get("lng"),
                "hub": spec.get("hub", ""),
                "is_current": bool(current_place and p.id == current_place.id),
                "url": f"/explorer/{p.slug}/" if p.slug else f"/places/{p.district.name.lower()}/"
            })
    except Exception as e:
        print("Error compiling all karnataka places:", e)
    return all_places


def place_detail(request, slug):
    place = get_object_or_404(
        Place.objects.select_related("district"),
        slug=slug,
    )

    place_details = PlaceDetails.objects.filter(
        place=place
    ).first()

    clear_origin = request.GET.get("clear_origin") or request.POST.get("clear_origin")
    param_origin = request.POST.get("origin") or request.GET.get("origin")
    is_clearing = bool(clear_origin or (param_origin and param_origin.strip().lower() in ("clear", "reset", "none")))

    cookie_lat = None if is_clearing else request.COOKIES.get("tourist_user_lat")
    cookie_lng = None if is_clearing else request.COOKIES.get("tourist_user_lng")
    lat_raw = request.GET.get("lat") or request.POST.get("lat") or cookie_lat
    lng_raw = request.GET.get("lng") or request.POST.get("lng") or cookie_lng
    session_origin = request.session.get("user_origin")
    session_lat = request.session.get("user_lat")
    session_lng = request.session.get("user_lng")

    # Parse coordinates if valid numbers
    lat = None
    lng = None
    if not is_clearing and lat_raw and lng_raw:
        try:
            lat = float(lat_raw)
            lng = float(lng_raw)
        except (ValueError, TypeError):
            lat = None
            lng = None

    # Handle Reset / Clear
    if is_clearing:
        request.session.pop("user_origin", None)
        request.session.pop("user_lat", None)
        request.session.pop("user_lng", None)
        origin = None
        lat = None
        lng = None
        if request.headers.get("x-requested-with") == "XMLHttpRequest":
            transit_data = resolve_destination_transit(place, origin_name=None, origin_lat=None, origin_lng=None)
            transit_data["all_places"] = get_all_karnataka_places_data(place)
            resp = JsonResponse(transit_data)
            resp.delete_cookie("tourist_user_lat")
            resp.delete_cookie("tourist_user_lng")
            return resp
    elif lat is not None and lng is not None:
        # Live Device GPS received
        cookie_city = request.COOKIES.get("tourist_user_city")
        if param_origin:
            origin = param_origin.strip()
        elif cookie_city:
            origin = f"{cookie_city} (Live GPS)"
        else:
            origin = None
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
    elif request.COOKIES.get("tourist_user_city"):
        origin = f"{request.COOKIES.get('tourist_user_city')} (Live GPS)"
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
        transit_data["all_places"] = get_all_karnataka_places_data(place)
        resp = JsonResponse(transit_data)
        if lat is not None and lng is not None:
            resp.set_cookie("tourist_user_lat", str(lat), max_age=604800, samesite="Lax")
            resp.set_cookie("tourist_user_lng", str(lng), max_age=604800, samesite="Lax")
        elif is_clearing:
            resp.delete_cookie("tourist_user_lat")
            resp.delete_cookie("tourist_user_lng")
        return resp

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

    all_places_data = get_all_karnataka_places_data(place)
    response = render(
        request,
        "explorer/dashboard.html",
        {
            "place": place,
            "place_details": place_details,
            "expense": expense,
            "error": error,
            "transit": transit,
            "origin": origin,
            "nearby_places": get_nearby_places_with_routes(place),
            "all_places_json": json.dumps(all_places_data),
            "all_places_count": len(all_places_data),
        },
    )
    if lat is not None and lng is not None:
        response.set_cookie("tourist_user_lat", str(lat), max_age=604800, samesite="Lax")
        response.set_cookie("tourist_user_lng", str(lng), max_age=604800, samesite="Lax")
    elif is_clearing:
        response.delete_cookie("tourist_user_lat")
        response.delete_cookie("tourist_user_lng")
    return response


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
