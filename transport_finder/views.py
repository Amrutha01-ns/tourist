from rest_framework.decorators import api_view
from rest_framework.response import Response
from .services import search_direct_routes
from .models import TransitStop
@api_view(["GET"])
def search_routes(request):
    source = request.GET.get("from")
    destination = request.GET.get("to")
    if not source or not destination:
        return Response(
            {"error": "from and to are required"},
            status=400
        )
    results = search_direct_routes(source, destination)
    return Response({
        "from": source,
        "to": destination,
        "results": results
    })
@api_view(["GET"])
def search_stops(request):
    name = request.GET.get("name", "")

    stops = TransitStop.objects.filter(
        provider__code="BMTC",
        name__icontains=name
    )[:20]

    return Response({
        "results": [
            {
                "id": stop.stop_id,
                "name": stop.name,
                "latitude": stop.latitude,
                "longitude": stop.longitude,
            }
            for stop in stops
        ]
    })