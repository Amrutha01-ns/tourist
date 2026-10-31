from django.http import JsonResponse
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .route_planner import find_direct_bus_routes
from .models import TransitStop
from .services import (
    search_transport_routes,
    search_transfer_routes,
    search_transport_stops,
    nearest_stop_name,
)
from .route_planner import (
    find_direct_bus_routes,
    nearest_served_stop,
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
@api_view(["GET"])
def plan_bus_routes(request):
    origin = request.query_params.get("from", "").strip()
    destination = request.query_params.get("to", "").strip()

    if not origin or not destination:
        return Response(
            {
                "error": "Both 'from' and 'to' are required."
            },
            status=400,
        )

    if origin.casefold() == destination.casefold():
        return Response(
            {
                "error": "Origin and destination must be different."
            },
            status=400,
        )

    routes = find_direct_bus_routes(origin, destination)

    return Response({
        "from": origin,
        "to": destination,
        "direct_routes": routes,
        "summary": {
            "direct_count": len(routes),
            "routes_found": bool(routes),
        },
    })
@api_view(["GET"])
def plan_from_location(request):
    try:
        latitude = float(request.query_params.get("lat"))
        longitude = float(request.query_params.get("lng"))
    except (TypeError, ValueError):
        return Response(
            {"error": "Valid lat and lng coordinates are required."},
            status=400,
        )

    destination = request.query_params.get("to", "").strip()

    if not destination:
        return Response(
            {"error": "A destination bus stop is required."},
            status=400,
        )

    origin_stop = nearest_served_stop(latitude, longitude)

    if not origin_stop:
        return Response(
            {
                "error": (
                    "No nearby stop linked to a stored trip was found. "
                    "Try a location within 5 km of a served stop."
                )
            },
            status=404,
        )

    routes = find_direct_bus_routes(
        origin_stop.name,
        destination,
    )

    return Response({
        "origin": origin_stop.name,
        "destination": destination,
        "direct_routes": routes,
        "summary": {
            "direct_count": len(routes),
            "routes_found": bool(routes),
        },
    })



@api_view(["GET"])
def destination_transit_view(request, slug):
    from places.models import Place
    from django.shortcuts import get_object_or_404
    from .services import resolve_destination_transit

    place = get_object_or_404(
        Place.objects.select_related("district"),
        slug=slug
    )
    origin = request.GET.get("origin", "").strip()
    lat = request.GET.get("lat")
    lng = request.GET.get("lng")

    transit_data = resolve_destination_transit(
        place,
        origin_name=origin,
        origin_lat=lat,
        origin_lng=lng
    )
    return Response(transit_data)
