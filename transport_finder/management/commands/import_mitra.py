from django.core.management.base import BaseCommand
from transport_finder.models import TransportProvider
class Command(BaseCommand):
    help = "Prepare Mysuru MITRA transport provider"
    def handle(self, *args, **options):
        provider, created = TransportProvider.objects.get_or_create(
            code="MITRA",
            defaults={
                "name": "Mysuru MITRA"
            }
        )
        if created:
            self.stdout.write(
                self.style.SUCCESS(
                    "MITRA provider created successfully."
                )
            )
        else:
            self.stdout.write(
                "MITRA provider already exists."
            )