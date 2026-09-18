from django.shortcuts import render
from places.models import Place
def dashboard(request):
    places = Place.objects.all()
    return render(
        request,
        "explorer/dashboard.html",
        {
            "places": places
        }
    )