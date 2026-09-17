from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import TransitStop

from .services import (
    search_transport_routes,
    search_transfer_routes,
    search_transport_stops,
    nearest_stop_name,
)


@api_view(["GET"])
def search_routes(request):

    source = request.GET.get("from")
    destination = request.GET.get("to")

    if not source or not destination:
        return Response(
            {"error": "from and to are required"},
            status=400,
        )

    direct_results = search_transport_routes(
        source,
        destination,
    )

    transfer_results = search_transfer_routes(
        source,
        destination,
    )

    return Response({
        "from": source,
        "to": destination,
        "direct_routes": direct_results,
        "transfer_routes": transfer_results,
        "summary": {
            "direct_count": len(direct_results),
            "transfer_count": len(transfer_results),
            "routes_found": bool(
                direct_results or transfer_results
            ),
        },
    })


@api_view(["GET"])
def search_stops(request):

    name = request.GET.get("name", "")

    stops = TransitStop.objects.filter(
        name__icontains=name
    )[:20]

    return Response({
        "results": [
            {
                "id": stop.stop_id,
                "name": stop.name,
                "latitude": stop.latitude,
                "longitude": stop.longitude,
                "provider": stop.provider.code,
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


@api_view(["GET"])
def search_by_location(request):

    try:
        user_lat = float(request.GET.get("lat"))
        user_lng = float(request.GET.get("lng"))
        dest_lat = float(request.GET.get("dest_lat"))
        dest_lng = float(request.GET.get("dest_lng"))

    except (TypeError, ValueError):
        return Response(
            {
                "error": (
                    "lat, lng, dest_lat, dest_lng "
                    "are required and must be numbers"
                )
            },
            status=400,
        )

    source = nearest_stop_name(
        user_lat,
        user_lng,
    )

    destination = nearest_stop_name(
        dest_lat,
        dest_lng,
    )

    if not source or not destination:
        return Response(
            {
                "error": (
                    "No nearby stops found for "
                    "one or both locations"
                )
            },
            status=404,
        )

    direct_results = search_transport_routes(
        source,
        destination,
    )

    transfer_results = search_transfer_routes(
        source,
        destination,
    )

    return Response({
        "from": source,
        "to": destination,
        "direct_routes": direct_results,
        "transfer_routes": transfer_results,
        "summary": {
            "direct_count": len(direct_results),
            "transfer_count": len(transfer_results),
            "routes_found": bool(
                direct_results or transfer_results
            ),
        },
    })