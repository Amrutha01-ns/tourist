from django.core.management.base import BaseCommand
from transport_finder.models import TransportProvider, TransitStop, Route, RouteStop


class Command(BaseCommand):
    help = "Import verified KSRTC intercity connections"

    def handle(self, *args, **kwargs):

        provider, _ = TransportProvider.objects.get_or_create(
            code="KSRTC",
            defaults={
                "name": "Karnataka State Road Transport Corporation"
            }
        )

        places = {
            "Hunsur": (12.3030, 76.2920),
            "Mysuru": (12.2958, 76.6394),
            "Bengaluru": (12.9716, 77.5946),
            "Chikkamagaluru": (13.3161, 75.7720),
            "Madikeri": (12.4244, 75.7382),
        }

        stops = {}

        for name, (lat, lon) in places.items():
            stop, _ = TransitStop.objects.get_or_create(
                provider=provider,
                stop_id=f"KSRTC-{name.upper()}",
                defaults={
                    "name": name,
                    "latitude": lat,
                    "longitude": lon,
                }
            )
            stops[name] = stop

        routes = [
            (
                "HUN-MYS",
                "Hunasuru → Mysuru",
                ["Hunsur", "Mysuru"]
            ),
            (
                "MYS-HUN",
                "Mysuru → Hunsuru",
                ["Mysuru", "Hunsur"]
            ),
            (
                "BLR-MYS",
                "Bengaluru → Mysuru",
                ["Bengaluru", "Mysuru"]
            ),
            (
                "MYS-BLR",
                "Mysuru → Bengaluru",
                ["Mysuru", "Bengaluru"]
            ),
            (
                "BLR-CKM",
                "Bengaluru → Chikkamagaluru",
                ["Bengaluru", "Chikkamagaluru"]
            ),
            (
                "BLR-MDK",
                "Bengaluru → Madikeri",
                ["Bengaluru", "Madikeri"]
            ),
        ]

        # Remove only our previous KSRTC test network.
        RouteStop.objects.filter(route__provider=provider).delete()
        Route.objects.filter(provider=provider).delete()
        TransitStop.objects.filter(provider=provider).delete()

        stops = {}

        for name, (lat, lon) in places.items():
            stop = TransitStop.objects.create(
                provider=provider,
                stop_id=f"KSRTC-{name.upper()}",
                name=name,
                latitude=lat,
                longitude=lon,
            )
            stops[name] = stop

        for route_id, route_name, stop_names in routes:

            route = Route.objects.create(
                provider=provider,
                route_id=route_id,
                route_name=route_name,
            )

            for sequence, stop_name in enumerate(stop_names, start=1):
                RouteStop.objects.create(
                    route=route,
                    stop=stops[stop_name],
                    stop_sequence=sequence,
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"KSRTC verified network imported: "
                f"{len(stops)} stops, "
                f"{len(routes)} routes, "
                f"{len(routes) * 2} connections"
            )
        )