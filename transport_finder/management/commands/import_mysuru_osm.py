import requests

from django.core.management.base import BaseCommand
from transport_finder.models import (
    TransportProvider,
    TransitStop,
    Route,
    RouteStop,
)


class Command(BaseCommand):
    help = "Import Mysuru bus stops and routes from OpenStreetMap"

    OVERPASS_URL = "https://maps.mail.ru/osm/tools/overpass/api/interpreter"

   
    STOP_QUERY = """
[out:json][timeout:30];

node["highway"="bus_stop"](12.25,76.57,12.40,76.70);

out body;
"""

    ROUTE_QUERY = """
[out:json][timeout:30];

relation["type"="route"]["route"="bus"](12.30,76.58,12.38,76.67);

out body;
"""

    HEADERS = {
        "User-Agent": "TouristProject/1.0 (Django transport data importer)",
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    def handle(self, *args, **options):

        # -------------------------------------------------
        # GET MITRA PROVIDER
        # -------------------------------------------------

        provider, created = TransportProvider.objects.get_or_create(
            code="MITRA",
            defaults={
                "name": "Mysuru MITRA"
            }
        )

        # -------------------------------------------------
        # IMPORT BUS STOPS
        # -------------------------------------------------

        self.stdout.write("Fetching Mysuru bus stops...")

        response = requests.post(
            self.OVERPASS_URL,
            data={
                "data": self.STOP_QUERY
            },
            headers=self.HEADERS,
            timeout=120,
        )

        response.raise_for_status()

        data = response.json()

        stop_count = 0

        for element in data.get("elements", []):

            if element.get("type") != "node":
                continue

            stop_id = f"OSM-{element['id']}"

            tags = element.get("tags", {})

            name = (
                tags.get("name")
                or tags.get("official_name")
                or "Unnamed Stop"
            )

            latitude = element.get("lat")
            longitude = element.get("lon")

            TransitStop.objects.update_or_create(
                provider=provider,
                stop_id=stop_id,
                defaults={
                    "name": name,
                    "latitude": latitude or 0,
                    "longitude": longitude or 0,
                },
            )

            stop_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Mysuru stops imported: {stop_count}"
            )
        )

        # -------------------------------------------------
        # IMPORT BUS ROUTES
        # -------------------------------------------------

        self.stdout.write("Fetching Mysuru bus routes...")

        response = requests.post(
            self.OVERPASS_URL,
            data={
                "data": self.ROUTE_QUERY
            },
            headers=self.HEADERS,
            timeout=180,
        )

        response.raise_for_status()

        route_data = response.json()

        route_count = 0
        route_stop_count = 0

        for relation in route_data.get("elements", []):

            if relation.get("type") != "relation":
                continue

            tags = relation.get("tags", {})

            route_number = (
                tags.get("ref")
                or tags.get("name")
                or f"OSM-{relation['id']}"
            )

            route_name = (
                tags.get("name")
                or tags.get("ref")
                or f"Mysuru Route {relation['id']}"
            )

            route, _ = Route.objects.update_or_create(
                provider=provider,
                route_id=f"OSM-{relation['id']}",
                defaults={
                    "route_name": f"{route_number} - {route_name}"
                },
            )

            sequence = 1

            for member in relation.get("members", []):

                if member.get("type") != "node":
                    continue

                node_id = member.get("ref")

                stop = TransitStop.objects.filter(
                    provider=provider,
                    stop_id=f"OSM-{node_id}"
                ).first()

                if not stop:
                    continue

                RouteStop.objects.update_or_create(
                    route=route,
                    stop=stop,
                    defaults={
                        "stop_sequence": sequence
                    },
                )

                sequence += 1
                route_stop_count += 1

            route_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Mysuru routes imported: {route_count}"
            )
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"Route-stop connections created: {route_stop_count}"
            )
        )

        self.stdout.write(
            self.style.SUCCESS(
                "Mysuru OSM transport import completed."
            )
        )