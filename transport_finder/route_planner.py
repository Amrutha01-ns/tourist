
from .models import TransitStop, StopTime


DESTINATION_ALIASES = {
    "majestic": ["Kempegowda Bus Station"],
}


def find_direct_bus_routes(origin, destination, limit=50):
    origin = origin.strip()
    destination = destination.strip()

    if not origin or not destination:
        return []

    destination_names = DESTINATION_ALIASES.get(
        destination.casefold(),
        [destination],
    )

    source_times = (
        StopTime.objects.filter(
            stop__name__icontains=origin,
        )
        .select_related(
            "stop",
            "trip",
            "trip__route",
            "trip__route__provider",
        )
        .order_by("trip_id", "stop_sequence")
    )

    results = []
    seen = set()

    for source_time in source_times:
        for destination_name in destination_names:
            destination_times = (
                StopTime.objects.filter(
                    trip_id=source_time.trip_id,
                    stop__name__icontains=destination_name,
                    stop_sequence__gt=source_time.stop_sequence,
                )
                .select_related("stop")
                .order_by("stop_sequence")
            )

            for destination_time in destination_times:
                key = (
                    source_time.trip_id,
                    source_time.stop_id,
                    destination_time.stop_id,
                    source_time.stop_sequence,
                    destination_time.stop_sequence,
                )

                if key in seen:
                    continue

                seen.add(key)
                route = source_time.trip.route

                results.append({
                    "provider": route.provider.name,
                    "provider_code": route.provider.code,
                    "route_id": route.route_id,
                    "route_name": route.route_name,
                    "trip_id": source_time.trip.trip_id,
                    "boarding_stop": source_time.stop.name,
                    "boarding_stop_id": source_time.stop.stop_id,
                    "drop_stop": destination_time.stop.name,
                    "drop_stop_id": destination_time.stop.stop_id,
                    "departure_time": str(
                        source_time.departure_time
                    ),
                    "arrival_time": str(
                        destination_time.arrival_time
                    ),
                    "timings_available": True,
                })

                if len(results) >= limit:
                    return results

    return results


def nearest_served_stop(latitude, longitude, radius_km=5):
    from .services import nearby_stops

    candidates = nearby_stops(
        latitude,
        longitude,
        radius_km=radius_km,
    )

    for candidate in candidates:
        stop = candidate["stop"]

        if StopTime.objects.filter(stop=stop).exists():
            return stop

    return None
