from .models import TransitStop, StopTime
def search_direct_routes(source, destination):
    source_stops = TransitStop.objects.filter(
        name__icontains=source,
        provider__code="BMTC"
    )
    destination_stops = TransitStop.objects.filter(
        name__icontains=destination,
        provider__code="BMTC"
    )
    results = []
    for source_stop in source_stops:
        source_times = StopTime.objects.filter(
            stop=source_stop
        ).select_related("trip", "trip__route")
        for source_time in source_times:
            destination_time = StopTime.objects.filter(
                trip=source_time.trip,
                stop__in=destination_stops,
                stop_sequence__gt=source_time.stop_sequence
            ).first()
            if destination_time:
                results.append({
                    "route": source_time.trip.route.route_name,
                    "departure": source_time.departure_time,
                    "arrival": destination_time.arrival_time,
                    "from_stop": source_stop.name,
                    "to_stop": destination_time.stop.name,
                })
    return results