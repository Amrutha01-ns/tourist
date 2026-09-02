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