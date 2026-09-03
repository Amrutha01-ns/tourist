from rest_framework.decorators import api_view
from rest_framework.response import Response
from .services import (
    search_transport_routes,
    search_transfer_routes,
    search_transport_stops,
)
from .models import TransitStop
from django.http import JsonResponse
@api_view(["GET"])
def search_routes(request):
    source = request.GET.get("from")
    destination = request.GET.get("to")

    if not source or not destination:
        return Response(
            {"error": "from and to are required"},
            status=400
        )

    direct_results = search_transport_routes(
        source,
        destination
    )

    transfer_results = search_transfer_routes(
        source,
        destination
    )

    return Response({
        "from": source,
        "to": destination,
        "direct_routes": direct_results,
        "transfer_routes": transfer_results,
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


def transport_search(request):
    query = request.GET.get("q", "").strip()

    if not query:
        return JsonResponse({
            "results": []
        })

    results = search_transport_stops(query)

    return JsonResponse({
        "results": results
    })