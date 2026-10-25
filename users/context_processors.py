from places.models import District


def topnav(request):
    """Data every page needs for the shared top nav bar."""
    match = getattr(request, "resolver_match", None)
    url_name = match.url_name if match else ""
    path = request.path

    if url_name == "dashboard" and path.startswith("/users/"):
        active = "home"
    elif url_name in ("places_by_district", "place_detail"):
        active = "districts"
    elif path.startswith("/explorer/"):
        active = "plan"
    else:
        active = ""

    try:
        districts = list(District.objects.only("name").order_by("name"))
    except Exception:  # DB not ready (e.g. during migrate)
        districts = []

    return {"nav_districts": districts, "nav_active": active}
