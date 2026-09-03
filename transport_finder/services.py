from math import radians, sin, cos, sqrt, atan2

from .models import TransitStop,StopTime


def nearby_stops(latitude, longitude, radius_km=5):
    """
    Return transit stops within radius_km of a location.
    """

    # Rough bounding box first — reduces database work
    lat_delta = radius_km / 111
    lon_delta = radius_km / (111 * cos(radians(latitude)))

    stops = TransitStop.objects.filter(
        latitude__isnull=False,
        longitude__isnull=False,
        latitude__gte=latitude - lat_delta,
        latitude__lte=latitude + lat_delta,
        longitude__gte=longitude - lon_delta,
        longitude__lte=longitude + lon_delta,
    )

    nearby = []

    for stop in stops:

        lat1 = radians(latitude)
        lon1 = radians(longitude)
        lat2 = radians(float(stop.latitude))
        lon2 = radians(float(stop.longitude))

        dlat = lat2 - lat1
        dlon = lon2 - lon1

        a = (
            sin(dlat / 2) ** 2
            + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
        )

        c = 2 * atan2(sqrt(a), sqrt(1 - a))

        distance = 6371 * c

        if distance <= radius_km:
            nearby.append({
                "stop": stop,
                "distance_km": round(distance, 2),
            })

    nearby.sort(key=lambda x: x["distance_km"])

    return nearby

def routes_for_stop(stop_id):
    return list(
        StopTime.objects
        .filter(stop__stop_id=str(stop_id))
        .values(
            "trip__route__route_id",
            "trip__route__route_name",
        )
        .distinct()
    )
def search_transport_stops(query, provider_code="MITRA"):
    return list(
        TransitStop.objects
        .filter(
            provider__code=provider_code,
            name__icontains=query
        )
        .values(
            "stop_id",
            "name",
            "latitude",
            "longitude"
        )[:20]
    )
def search_direct_routes(source, destination, provider_code="BMTC"):
    source_stops = TransitStop.objects.filter(
        provider__code=provider_code,
        name__icontains=source
    )

    destination_stops = TransitStop.objects.filter(
        provider__code=provider_code,
        name__icontains=destination
    )

    source_ids = list(
        source_stops.values_list("id", flat=True)
    )

    destination_ids = list(
        destination_stops.values_list("id", flat=True)
    )

    if not source_ids or not destination_ids:
        return []

    source_trip_ids = StopTime.objects.filter(
        stop_id__in=source_ids
    ).values_list("trip_id", flat=True).distinct()

    direct_trips = StopTime.objects.filter(
        trip_id__in=source_trip_ids,
        stop_id__in=destination_ids
    ).select_related("trip__route", "stop")

    results = []

    for stop_time in direct_trips:
        results.append({
            "route_id": stop_time.trip.route.route_id,
            "route_name": stop_time.trip.route.route_name,
            "trip_id": stop_time.trip.trip_id,
            "destination_stop": stop_time.stop.name,
            "arrival_time": str(stop_time.arrival_time),
            "departure_time": str(stop_time.departure_time),
        })

    return results
from .models import TransitStop, RouteStop
def search_mysuru_routes(from_name, to_name):
    from_stops = TransitStop.objects.filter(
        provider__code="MITRA",
        name__iexact=from_name
    )

    to_stops = TransitStop.objects.filter(
        provider__code="MITRA",
        name__iexact=to_name
    )

    results = []

    for from_stop in from_stops:
        starts = RouteStop.objects.filter(
            stop=from_stop
        ).select_related("route")

        for start in starts:

            ends = RouteStop.objects.filter(
                route=start.route,
                stop__in=to_stops,
                stop_sequence__gt=start.stop_sequence
            ).select_related("stop")

            for end in ends:
                results.append({
                    "route": start.route.route_name,
                    "from": from_stop.name,
                    "to": end.stop.name,
                    "from_sequence": start.stop_sequence,
                    "to_sequence": end.stop_sequence,
                })

    return results
def search_intercity_routes(from_name, to_name):
    """
    Search KSRTC routes between two intercity locations.
    """

    from_stops = TransitStop.objects.filter(
        provider__code="KSRTC",
        name__iexact=from_name
    )

    to_stops = TransitStop.objects.filter(
        provider__code="KSRTC",
        name__iexact=to_name
    )

    results = []

    for from_stop in from_stops:
        starts = RouteStop.objects.filter(
            stop=from_stop
        ).select_related("route")

        for start in starts:

            ends = RouteStop.objects.filter(
                route=start.route,
                stop__in=to_stops,
                stop_sequence__gt=start.stop_sequence
            ).select_related("stop")

            for end in ends:
                results.append({
                    "provider": "KSRTC",
                    "route": start.route.route_name,
                    "from": from_stop.name,
                    "to": end.stop.name,
                    "from_sequence": start.stop_sequence,
                    "to_sequence": end.stop_sequence,
                })

    return results
def search_transport_routes(from_name, to_name):
    """
    Search across KSRTC and MITRA.
    BMTC will be integrated separately for city-level journeys.
    """

    results = []

    # KSRTC intercity
    results.extend(
        search_intercity_routes(from_name, to_name)
    )

    # MITRA city routes
    results.extend(
        search_mysuru_routes(from_name, to_name)
    )

    return results
def search_transfer_routes(from_name, to_name):
    results = []
    seen = set()

    # KSRTC first leg
    first_legs = search_intercity_routes(from_name, "Mysuru")

    # Real MITRA interchange stops
    transfer_stops = TransitStop.objects.filter(
        provider__code="MITRA",
        name__in=["Palace Bus Stop", "Rural Bus Stand"]
    )

    # Destination in MITRA
    destination_stops = TransitStop.objects.filter(
        provider__code="MITRA",
        name__iexact=to_name
    )

    for first in first_legs:

        for transfer_stop in transfer_stops:

            starts = RouteStop.objects.filter(
                stop=transfer_stop
            ).select_related("route")

            for start in starts:

                ends = RouteStop.objects.filter(
                    route=start.route,
                    stop__in=destination_stops,
                    stop_sequence__gt=start.stop_sequence
                ).select_related("stop")

                for end in ends:

                    key = (
                        first["route"],
                        start.route.route_id,
                        end.stop.name
                    )

                    if key in seen:
                        continue

                    seen.add(key)

                    results.append({
                        "type": "1_transfer",
                        "from": from_name,
                        "to": to_name,
                        "transfer_at": "Mysuru",

                        "first_leg": first,

                        "second_leg": {
                            "provider": "MITRA",
                            "route": start.route.route_name,
                            "from": transfer_stop.name,
                            "to": end.stop.name,
                            "from_sequence": start.stop_sequence,
                            "to_sequence": end.stop_sequence,
                        }
                    })

    return results