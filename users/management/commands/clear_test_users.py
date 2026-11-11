from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from users.models import EmailOTP, UserProfile


class Command(BaseCommand):
    help = "Clears all non-superuser test accounts and OTP records for clean testing"

    def handle(self, *args, **options):
        users_count, _ = User.objects.filter(is_superuser=False).delete()
        otp_count, _ = EmailOTP.objects.all().delete()
        self.stdout.write(self.style.SUCCESS(f"Successfully cleared {users_count} test users and {otp_count} OTP records."))
