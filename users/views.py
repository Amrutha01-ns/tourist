
from django.contrib.auth.models import User
from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from places.models import District, Place


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
                "error": "YOU have entered wrong username nd password,,plz enter valid"
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
        "chikmagalur": find_place(
            "Mullayanagiri",
            "Chikkamagaluru",
            "Chikmagalur",
        ),
        "hampi": find_place("Hampi"),
        "udupi": find_place("Udupi"),
    }

    for name, place in featured_places.items():
        print(
            name,
            "FOUND:", place is not None,
            "IMAGE:", (
                place.image.name
                if place and place.image
                else "NO IMAGE"
            )
        )

    return render(
        request,
        "users/dashboard.html",
        {
            "districts": districts,
            "featured_places": featured_places,
        },
    )
def places_by_district(request, district_name):
    district = get_object_or_404(
        District,
        name__iexact=district_name
    )

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
