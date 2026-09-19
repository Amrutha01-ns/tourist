from django.shortcuts import render, get_object_or_404
from places.models import Place


def place_detail(request, slug):
    place = get_object_or_404(Place, slug=slug)

    return render(
        request,
        "explorer/dashboard.html",
        {"place": place}
    )