# Create your views here.
from django.contrib.auth.models import User
from django.shortcuts import render, redirect,get_object_or_404
from django.contrib.auth import authenticate,login,logout
from places.models import District,Place



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
def dashboard(request):
    return render(request, "users/dashboard.html")
def places_by_district(request, district_name):
    district = get_object_or_404(
        District,
        name__iexact=district_name
    )
    places = Place.objects.filter(
        district=district
    )
    return render(
        request,
        "users/places.html",
        {
            "district": district,
            "places": places,
        }
    )