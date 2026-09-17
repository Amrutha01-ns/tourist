from math import radians, sin, cos, sqrt, atan2

from .models import (
    TransitStop,
    StopTime,
    RouteStop,
    Fare,
)


# ---------------------------------------------------------
# 1. NEARBY STOPS
# ---------------------------------------------------------

def nearby_stops(latitude, longitude, radius_km=5):
    lat_delta = radius_km / 111
    lon_delta = radius_km / (
        111 * cos(radians(latitude))
    )

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
            + cos(lat1)
            * cos(lat2)
            * sin(dlon / 2) ** 2
        )

        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        distance = 6371 * c

        if distance <= radius_km:
            nearby.append({
                "stop": stop,
                "distance_km": round(distance, 2),
            })

    nearby.sort(
        key=lambda x: x["distance_km"]
    )

    return nearby


# ---------------------------------------------------------
# 2. ROUTES FOR A STOP
# ---------------------------------------------------------

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


# ---------------------------------------------------------
# 3. SEARCH STOPS
# ---------------------------------------------------------

def search_transport_stops(
    query,
    provider_code=None
):
    stops = TransitStop.objects.filter(
        name__icontains=query
    )

    if provider_code:
        stops = stops.filter(
            provider__code=provider_code
        )

    return list(
        stops.values(
            "stop_id",
            "name",
            "latitude",
            "longitude",
            "provider__name",
            "provider__code",
        )[:20]
    )


# ---------------------------------------------------------
# 4. FARE
# ---------------------------------------------------------

def get_fare(provider):
    fare = Fare.objects.filter(
        provider=provider
    ).order_by("price").first()

    if not fare:
        return None

    return {
        "fare_id": fare.fare_id,
        "price": float(fare.price),
        "currency": fare.currency,
    }


# ---------------------------------------------------------
# 5. TIMETABLE HELPER
# ---------------------------------------------------------

def find_trip_timing(
    route,
    from_stop,
    to_stop
):
    from_times = (
        StopTime.objects
        .filter(
            trip__route=route,
            stop=from_stop,
        )
        .select_related("trip")
        .order_by("departure_time")
    )

    for from_time in from_times:

        to_time = (
            StopTime.objects
            .filter(
                trip=from_time.trip,
                stop=to_stop,
                stop_sequence__gt=(
                    from_time.stop_sequence
                ),
            )
            .order_by("stop_sequence")
            .first()
        )

        if to_time:
            return {
                "timings_available": True,
                "trip_id": from_time.trip.trip_id,
                "departure_time": str(
                    from_time.departure_time
                ),
                "arrival_time": str(
                    to_time.arrival_time
                ),
            }

    return {
        "timings_available": False,
        "trip_id": None,
        "departure_time": None,
        "arrival_time": None,
    }


# ---------------------------------------------------------
# 6. DIRECT ROUTES USING TRIP + STOPTIME
# ---------------------------------------------------------

def search_direct_routes(
    source,
    destination,
    provider_code=None
):
    source_stops = TransitStop.objects.filter(
        name__icontains=source
    )

    destination_stops = TransitStop.objects.filter(
        name__icontains=destination
    )

    if provider_code:
        source_stops = source_stops.filter(
            provider__code=provider_code
        )

        destination_stops = destination_stops.filter(
            provider__code=provider_code
        )

    source_ids = list(
        source_stops.values_list(
            "id",
            flat=True
        )
    )

    destination_ids = list(
        destination_stops.values_list(
            "id",
            flat=True
        )
    )

    if not source_ids or not destination_ids:
        return []

    source_times = (
        StopTime.objects
        .filter(stop_id__in=source_ids)
        .select_related(
            "trip",
            "trip__route",
            "trip__route__provider",
            "stop",
        )
        .order_by("departure_time")
    )

    results = []

    for source_time in source_times:

        destination_time = (
            StopTime.objects
            .filter(
                trip=source_time.trip,
                stop_id__in=destination_ids,
                stop_sequence__gt=(
                    source_time.stop_sequence
                ),
            )
            .select_related("stop")
            .order_by("stop_sequence")
            .first()
        )

        if not destination_time:
            continue

        route = source_time.trip.route

        results.append({
            "provider": route.provider.name,
            "provider_code": route.provider.code,
            "route_id": route.route_id,
            "route": route.route_name,
            "trip_id": source_time.trip.trip_id,
            "from": source_time.stop.name,
            "to": destination_time.stop.name,
            "departure_time": str(
                source_time.departure_time
            ),
            "arrival_time": str(
                destination_time.arrival_time
            ),
            "timings_available": True,
            "fare": get_fare(route.provider),
        })

    return results


# ---------------------------------------------------------
# 7. MITRA ROUTES
# ---------------------------------------------------------

def search_mysuru_routes(
    from_name,
    to_name
):
    from_stops = TransitStop.objects.filter(
        provider__code="MITRA",
        name__icontains=from_name,
    )

    to_stops = TransitStop.objects.filter(
        provider__code="MITRA",
        name__icontains=to_name,
    )

    results = []

    for from_stop in from_stops:

        starts = (
            RouteStop.objects
            .filter(stop=from_stop)
            .select_related(
                "route",
                "route__provider",
            )
        )

        for start in starts:

            ends = (
                RouteStop.objects
                .filter(
                    route=start.route,
                    stop__in=to_stops,
                    stop_sequence__gt=(
                        start.stop_sequence
                    ),
                )
                .select_related("stop")
                .order_by("stop_sequence")
            )

            for end in ends:

                results.append({
                    "provider": (
                        start.route.provider.name
                    ),
                    "provider_code": (
                        start.route.provider.code
                    ),
                    "route_id": (
                        start.route.route_id
                    ),
                    "route": (
                        start.route.route_name
                    ),
                    "from": from_stop.name,
                    "to": end.stop.name,
                    "from_sequence": (
                        start.stop_sequence
                    ),
                    "to_sequence": (
                        end.stop_sequence
                    ),
                    "timings_available": False,
                    "fare": get_fare(
                        start.route.provider
                    ),
                })

    return results


# ---------------------------------------------------------
# 8. KSRTC / INTERCITY ROUTES
# ---------------------------------------------------------

def search_intercity_routes(
    from_name,
    to_name
):
    from_stops = TransitStop.objects.filter(
        provider__code="KSRTC",
        name__icontains=from_name,
    )

    to_stops = TransitStop.objects.filter(
        provider__code="KSRTC",
        name__icontains=to_name,
    )

    results = []

    for from_stop in from_stops:

        starts = (
            RouteStop.objects
            .filter(stop=from_stop)
            .select_related(
                "route",
                "route__provider",
            )
        )

        for start in starts:

            ends = (
                RouteStop.objects
                .filter(
                    route=start.route,
                    stop__in=to_stops,
                    stop_sequence__gt=(
                        start.stop_sequence
                    ),
                )
                .select_related("stop")
                .order_by("stop_sequence")
            )

            for end in ends:

                timing = find_trip_timing(
                    start.route,
                    from_stop,
                    end.stop,
                )

                result = {
                    "provider": (
                        start.route.provider.name
                    ),
                    "provider_code": (
                        start.route.provider.code
                    ),
                    "route_id": (
                        start.route.route_id
                    ),
                    "route": (
                        start.route.route_name
                    ),
                    "from": from_stop.name,
                    "to": end.stop.name,
                    "timings_available": (
                        timing["timings_available"]
                    ),
                    "fare": get_fare(
                        start.route.provider
                    ),
                }

                if timing["timings_available"]:
                    result.update({
                        "trip_id": timing["trip_id"],
                        "departure_time": (
                            timing["departure_time"]
                        ),
                        "arrival_time": (
                            timing["arrival_time"]
                        ),
                    })

                results.append(result)

    return results


# ---------------------------------------------------------
# 9. RANKING
# ---------------------------------------------------------

def time_sort_key(item):
    if not item.get("timings_available"):
        return (1, "99:99:99")

    return (
        0,
        item.get(
            "departure_time",
            "99:99:99"
        ),
    )


# ---------------------------------------------------------
# 10. ALL DIRECT TRANSPORT
# ---------------------------------------------------------

def search_transport_routes(
    from_name,
    to_name
):
    results = []

    # KSRTC
    results.extend(
        search_intercity_routes(
            from_name,
            to_name,
        )
    )

    # MITRA
    results.extend(
        search_mysuru_routes(
            from_name,
            to_name,
        )
    )

    # BMTC
    results.extend(
        search_direct_routes(
            from_name,
            to_name,
            provider_code="BMTC",
        )
    )

    # Remove exact duplicates
    unique = []
    seen = set()

    for result in results:

        key = (
            result.get("provider_code"),
            result.get("route_id"),
            result.get("trip_id"),
            result.get("from"),
            result.get("to"),
            result.get("departure_time"),
        )

        if key not in seen:
            seen.add(key)
            unique.append(result)

    # Timetabled journeys first,
    # then earlier departures
    unique.sort(
        key=time_sort_key
    )

    # Availability status
    for result in unique:
        if result.get("timings_available"):
            result["availability"] = "available"
        else:
            result["availability"] = (
                "route_found_no_timetable"
            )

        result["type"] = "direct"

    return unique


# ---------------------------------------------------------
# 11. ONE-TRANSFER JOURNEYS
# ---------------------------------------------------------

def search_transfer_routes(
    from_name,
    to_name
):
    results = []
    seen = set()

    # First leg: source → Mysuru
    first_legs = search_intercity_routes(
        from_name,
        "Mysuru",
    )

    if not first_legs:
        return []

    transfer_stops = (
        TransitStop.objects.filter(
            provider__code="MITRA",
            name__in=[
                "Palace Bus Stop",
                "Rural Bus Stand",
            ],
        )
    )

    destination_stops = (
        TransitStop.objects.filter(
            provider__code="MITRA",
            name__icontains=to_name,
        )
    )

    for first in first_legs:

        for transfer_stop in transfer_stops:

            second_routes = (
                RouteStop.objects
                .filter(stop=transfer_stop)
                .select_related(
                    "route",
                    "route__provider",
                )
            )

            for start in second_routes:

                destinations = (
                    RouteStop.objects
                    .filter(
                        route=start.route,
                        stop__in=destination_stops,
                        stop_sequence__gt=(
                            start.stop_sequence
                        ),
                    )
                    .select_related("stop")
                    .order_by("stop_sequence")
                )

                for end in destinations:

                    key = (
                        first.get("route_id"),
                        start.route.route_id,
                        end.stop.id,
                    )

                    if key in seen:
                        continue

                    seen.add(key)

                    second_timing = find_trip_timing(
                        start.route,
                        transfer_stop,
                        end.stop,
                    )

                    second_leg = {
                        "provider": (
                            start.route.provider.name
                        ),
                        "provider_code": (
                            start.route.provider.code
                        ),
                        "route_id": (
                            start.route.route_id
                        ),
                        "route": (
                            start.route.route_name
                        ),
                        "from": transfer_stop.name,
                        "to": end.stop.name,
                        "from_sequence": (
                            start.stop_sequence
                        ),
                        "to_sequence": (
                            end.stop_sequence
                        ),
                        "timings_available": (
                            second_timing[
                                "timings_available"
                            ]
                        ),
                        "fare": get_fare(
                            start.route.provider
                        ),
                    }

                    if second_timing[
                        "timings_available"
                    ]:
                        second_leg.update({
                            "trip_id": (
                                second_timing[
                                    "trip_id"
                                ]
                            ),
                            "departure_time": (
                                second_timing[
                                    "departure_time"
                                ]
                            ),
                            "arrival_time": (
                                second_timing[
                                    "arrival_time"
                                ]
                            ),
                        })

                    results.append({
                        "type": "1_transfer",
                        "from": from_name,
                        "to": to_name,
                        "transfer_at": "Mysuru",
                        "first_leg": first,
                        "second_leg": second_leg,
                        "timings_available": (
                            first.get(
                                "timings_available",
                                False
                            )
                            and second_timing[
                                "timings_available"
                            ]
                        ),
                    })

    return results
# ---------------------------------------------------------
# 12. LOCATION -> NEAREST STOP NAME
# ---------------------------------------------------------

def nearest_stop_name(latitude, longitude, provider_code=None):
    candidates = nearby_stops(latitude, longitude)

    if provider_code:
        candidates = [
            c for c in candidates
            if c["stop"].provider.code == provider_code
        ]

    if not candidates:
        return None

    return candidates[0]["stop"].name