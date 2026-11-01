from django.contrib.auth.models import User
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from places.models import District, Place
from transport_finder.models import TransitStop, Route, TransportProvider


def register(request):
    if request.method == "POST":
        username = request.POST["username"]
        email = request.POST["email"]
        password = request.POST["password"]

        User.objects.create_user(
            username=username,
            email=email,
            password=password
        )

        return redirect("login")

    return render(request, "users/register.html")


def user_login(request):
    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")

        user = authenticate(
            request,
            username=username,
            password=password
        )

        if user is not None:
            login(request, user)
            return redirect("dashboard")

        return render(
            request,
            "users/login.html",
            {
                "error": "You have entered wrong username or password. Please enter valid credentials."
            }
        )

    return render(request, "users/login.html")


@login_required(login_url="login")
def dashboard(request):
    districts = District.objects.prefetch_related("places").all()

    def find_place(*keywords):
        for keyword in keywords:
            place = (
                Place.objects
                .filter(name__icontains=keyword)
                .exclude(image="")
                .exclude(image__isnull=True)
                .select_related("district")
                .first()
            )
            if place:
                return place
        return None

    featured_places = {
        "mysore": find_place("Mysore Palace", "Mysore"),
        "madikeri": find_place("Abbey Falls", "Madikeri"),
        "chikmagalur": find_place("Mullayanagiri", "Baba Budangiri", "Chikkamagaluru"),
        "hampi": find_place("Virupaksha Temple", "Vittala Temple", "Hampi"),
        "udupi": find_place("Sri Krishna Temple", "Malpe Beach", "St. Mary's Island", "Udupi"),
    }

    # Verified metrics from real database models
    stats = {
        "destinations_count": Place.objects.count(),
        "districts_count": District.objects.count(),
        "stops_count": TransitStop.objects.count(),
        "routes_count": Route.objects.count(),
        "providers_count": TransportProvider.objects.count(),
    }

    return render(
        request,
        "users/dashboard.html",
        {
            "districts": districts,
            "featured_places": featured_places,
            "stats": stats,
        },
    )


DISTRICT_ALIASES = {
    # Chikkamagaluru (Has its own district in DB)
    "chikkamagaluru": "Chikkamagaluru",
    "chikmagalur": "Chikkamagaluru",
    "chikmagaluru": "Chikkamagaluru",
    "chikamanglore": "Chikkamagaluru",
    "chikkamangalore": "Chikkamagaluru",
    
    # Hampi (Has its own district in DB)
    "hampi": "Hampi",
    "vijayanagara": "Hampi",
    "hosapete": "Hampi",
    "hospet": "Hampi",
    
    # Udupi (Has its own district in DB)
    "udupi": "Udupi",
    "malpe": "Udupi",
    
    # Mangaluru (Has its own district in DB)
    "mangaluru": "Mangaluru",
    "mangalore": "Mangaluru",
    "dakshina kannada": "Mangaluru",
    "dakshinakannada": "Mangaluru",
    
    # Shivamogga (Has its own district in DB)
    "shivamogga": "Shivamogga",
    "shimoga": "Shivamogga",
    
    # Mandya (Has its own district in DB)
    "mandya": "Mandya",
    "srirangapatna": "Mandya",
    
    # Kodagu
    "kodagu": "kodagu",
    "madikeri": "kodagu",
    "coorg": "kodagu",
    
    # Mysore
    "mysore": "mysore",
    "mysuru": "mysore",
    
    # Hassan
    "hassan": "hassan",
    "belur": "hassan",
    "halebidu": "hassan",
    
    # Uttara Kannada
    "uttara kannada": "uttara kannada",
    "uttarakannada": "uttara kannada",
    "gokarna": "uttara kannada",
    "karwar": "uttara kannada",
    "dandeli": "uttara kannada",
    "kumta": "uttara kannada",
    "murudeshwar": "uttara kannada",
}


def places_by_district(request, district_name):
    clean_name = (district_name or "").strip().lower()

    # 1. Try direct match with database districts
    district = District.objects.filter(name__iexact=clean_name).first()

    # 2. Check alias dictionary if direct match not found
    if not district:
        resolved_name = DISTRICT_ALIASES.get(clean_name, clean_name)
        district = District.objects.filter(name__iexact=resolved_name).first()

    # If not found, try substring match (e.g. 'uttara' or 'kannada' -> 'uttara kannada')
    if not district:
        district = District.objects.filter(name__icontains=clean_name).first()

    # If a specific place name was searched (e.g. krs-dam, abbey-falls)
    if not district:
        place = Place.objects.filter(name__icontains=clean_name).first()
        if place and getattr(place, "slug", None):
            return redirect("explorer:place_detail", slug=place.slug)

    # If still not found, gracefully fall back to the first available district
    if not district:
        district = District.objects.first()

    if not district:
        # Absolute safety in empty DB
        district = get_object_or_404(District, name__iexact=district_name)

    all_places = Place.objects.filter(district=district)
    places = all_places

    # Category filter from the dropdown (?category=watery etc.)
    selected_category = request.GET.get("category", "")
    valid_categories = {key for key, _ in Place.CATEGORY_CHOICES}
    if selected_category in valid_categories:
        places = places.filter(category=selected_category)
    else:
        selected_category = ""

    # Select an image belonging to this district
    background_place = all_places.exclude(
        image=""
    ).first()

    context = {
        "district": district,
        "places": places,
        "background_place": background_place,
        "selected_category": selected_category,
    }

    return render(request, "users/places.html", context)


def logout_view(request):
    logout(request)
    return redirect("login")
