from django.contrib.auth.models import User
from django.shortcuts import render, redirect,get_object_or_404
from django.contrib.auth import authenticate,login,logout
from places.models import District,Place
from django.contrib.auth.decorators import login_required
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
        else:
            return render(
                request,
                "users/login.html",
                {"error": "YOU have entered wrong username nd password,,plz enter valid"}
            )
    return render(request, "users/login.html")
@login_required(login_url="login")
def dashboard(request):
    # Keep your existing dashboard function body unchanged.
    districts = District.objects.prefetch_related("places").all()
    # Keep your existing find_place() function,
    # featured_places dictionary, and render() call here.
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
from django.shortcuts import get_object_or_404, render
from places.models import District, Place
def places_by_district(request, district_name):
    district = get_object_or_404(
        District,
        name__iexact=district_name
    )
    places = Place.objects.filter(district=district)
    # Select an image belonging to this district
    background_place = places.exclude(
        image=""
    ).first()
    context = {
        "district": district,
        "places": places,
        "background_place": background_place,
    }
    return render(request, "users/places.html", context)
def logout_view(request):
    logout(request)
    return redirect("login")