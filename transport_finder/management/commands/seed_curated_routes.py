from django.core.management.base import BaseCommand
from transport_finder.models import TransportProvider, Route, TransitStop
from transport_finder.services import DESTINATION_TRANSIT_PROFILES


class Command(BaseCommand):
    help = "Seeds public bus routes and stops for all tourist destinations into the database."

    def handle(self, *args, **options):
        # Default providers dictionary
        providers = {
            "BMTC": TransportProvider.objects.get_or_create(
                code="BMTC",
                defaults={"name": "Bengaluru Metropolitan Transport Corporation"}
            )[0],
            "KSRTC": TransportProvider.objects.get_or_create(
                code="KSRTC",
                defaults={"name": "Karnataka State Road Transport Corporation"}
            )[0],
            "MITRA": TransportProvider.objects.get_or_create(
                code="MITRA",
                defaults={"name": "Mysuru MITRA"}
            )[0],
            "NWKRTC": TransportProvider.objects.get_or_create(
                code="NWKRTC",
                defaults={"name": "North Western Karnataka Road Transport"}
            )[0],
        }

        routes_created = 0
        routes_updated = 0
        stops_created = 0

        for place_slug, profile in DESTINATION_TRANSIT_PROFILES.items():
            bus_routes = profile.get("bus_routes", [])
            for r in bus_routes:
                p_code = r.get("provider_code", "KSRTC").upper()
                provider = providers.get(p_code, providers["KSRTC"])

                route_id = r.get("route_id") or r.get("bus_number")
                route_name = r.get("route_name", f"Route {route_id}")

                route, created = Route.objects.get_or_create(
                    provider=provider,
                    route_id=route_id,
                    defaults={"route_name": route_name}
                )
                if created:
                    routes_created += 1
                else:
                    if route.route_name != route_name:
                        route.route_name = route_name
                        route.save(update_fields=["route_name"])
                        routes_updated += 1

                # Seed transit stops
                for point_key in ["boarding_point", "drop_point"]:
                    stop_name = r.get(point_key)
                    if stop_name:
                        stop_id = f"STOP-{abs(hash(stop_name)) % 100000:05d}"
                        stop, s_created = TransitStop.objects.get_or_create(
                            provider=provider,
                            name=stop_name,
                            defaults={"stop_id": stop_id}
                        )
                        if s_created:
                            stops_created += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Curated routes synchronized: {routes_created} created, {routes_updated} updated. Stops created: {stops_created}."
            )
        )
