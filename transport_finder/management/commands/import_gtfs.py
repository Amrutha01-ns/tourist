from django.core.management.base import BaseCommand

from transport_finder.gtfs_importer import (
    import_gtfs_stops,
    import_gtfs_routes,
    import_gtfs_trips,
    import_gtfs_stop_times,
)


class Command(BaseCommand):
    help = "Import GTFS data for a transport provider"

    def add_arguments(self, parser):
        parser.add_argument("zip_path")
        parser.add_argument("provider_code")
        parser.add_argument("provider_name")

    def handle(self, *args, **options):

        zip_path = options["zip_path"]
        provider_code = options["provider_code"]
        provider_name = options["provider_name"]

        self.stdout.write(
            f"Importing GTFS for {provider_code}..."
        )

        import_gtfs_stops(
            zip_path,
            provider_code,
            provider_name,
        )

        import_gtfs_routes(
            zip_path,
            provider_code,
        )

        import_gtfs_trips(
            zip_path,
            provider_code,
        )

        import_gtfs_stop_times(
            zip_path,
            provider_code,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"{provider_code} GTFS import completed."
            )
        )