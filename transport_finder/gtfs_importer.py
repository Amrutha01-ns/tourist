import zipfile
import pandas as pd

from .models import (
    TransportProvider,
    TransitStop,
    Route,
    Trip,
    StopTime,
)


def get_provider(code, name):
    provider, _ = TransportProvider.objects.get_or_create(
        code=code,
        defaults={"name": name},
    )
    return provider


def import_gtfs_stops(zip_path, provider_code, provider_name):
    provider = get_provider(provider_code, provider_name)

    with zipfile.ZipFile(zip_path, "r") as z:
        with z.open("stops.txt") as file:
            stops = pd.read_csv(file, dtype=str)

    created_count = 0

    for _, row in stops.iterrows():

        _, created = TransitStop.objects.update_or_create(
            provider=provider,
            stop_id=str(row["stop_id"]),
            defaults={
                "name": str(row["stop_name"]),
                "latitude": float(row["stop_lat"])
                if pd.notna(row["stop_lat"]) else None,
                "longitude": float(row["stop_lon"])
                if pd.notna(row["stop_lon"]) else None,
            },
        )

        if created:
            created_count += 1

    print(f"{provider_code} stops processed: {len(stops)}")
    print(f"New stops created: {created_count}")


def import_gtfs_routes(zip_path, provider_code):
    provider = TransportProvider.objects.get(code=provider_code)

    with zipfile.ZipFile(zip_path, "r") as z:
        with z.open("routes.txt") as file:
            routes = pd.read_csv(file, dtype=str)

    created_count = 0

    for _, row in routes.iterrows():

        route_id = str(row["route_id"])

        route_name = str(
            row.get(
                "route_long_name",
                row.get("route_short_name", route_id),
            )
        )

        _, created = Route.objects.update_or_create(
            provider=provider,
            route_id=route_id,
            defaults={
                "route_name": route_name,
            },
        )

        if created:
            created_count += 1

    print(f"{provider_code} routes processed: {len(routes)}")
    print(f"New routes created: {created_count}")


def import_gtfs_trips(zip_path, provider_code):
    provider = TransportProvider.objects.get(code=provider_code)

    with zipfile.ZipFile(zip_path, "r") as z:
        with z.open("trips.txt") as file:
            trips = pd.read_csv(file, dtype=str)

    routes = {
        route.route_id: route
        for route in Route.objects.filter(provider=provider)
    }

    trip_objects = []

    for _, row in trips.iterrows():

        route = routes.get(str(row["route_id"]))

        if route:
            trip_objects.append(
                Trip(
                    route=route,
                    trip_id=str(row["trip_id"]),
                    service_id=str(row.get("service_id", "")),
                )
            )

    Trip.objects.bulk_create(
        trip_objects,
        batch_size=5000,
        ignore_conflicts=True,
    )

    print(f"{provider_code} trips read: {len(trips)}")
    print(f"Trips inserted: {len(trip_objects)}")


def import_gtfs_stop_times(
    zip_path,
    provider_code,
    limit=100000,
):
    provider = TransportProvider.objects.get(code=provider_code)

    trip_map = {
        trip.trip_id: trip
        for trip in Trip.objects.filter(
            route__provider=provider
        )
    }

    stop_map = {
        stop.stop_id: stop
        for stop in TransitStop.objects.filter(
            provider=provider
        )
    }

    inserted = 0

    with zipfile.ZipFile(zip_path, "r") as z:

        with z.open("stop_times.txt") as file:

            for chunk in pd.read_csv(
                file,
                dtype=str,
                chunksize=50000,
            ):

                objects = []

                for _, row in chunk.iterrows():

                    trip = trip_map.get(str(row["trip_id"]))
                    stop = stop_map.get(str(row["stop_id"]))

                    if trip and stop:

                        objects.append(
                            StopTime(
                                trip=trip,
                                stop=stop,
                                arrival_time=str(
                                    row["arrival_time"]
                                ),
                                departure_time=str(
                                    row["departure_time"]
                                ),
                                stop_sequence=int(
                                    row["stop_sequence"]
                                ),
                            )
                        )

                StopTime.objects.bulk_create(
                    objects,
                    batch_size=5000,
                    ignore_conflicts=True,
                )

                inserted += len(objects)

                print(
                    f"{provider_code} StopTimes inserted: "
                    f"{inserted}"
                )

                if inserted >= limit:
                    break

    print(
        f"{provider_code} StopTimes finished: {inserted}"
    )