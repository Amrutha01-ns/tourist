import secrets
from django.db import models, transaction
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta


class EmailOTP(models.Model):
    """
    Model for managing and verifying One-Time Passwords (OTPs) for email authentication.
    Enforces expiration, attempt limits, and single-use integrity.
    """
    PURPOSE_CHOICES = [
        ('register', 'Account Registration'),
        ('login', 'Sign In Verification'),
        ('reset', 'Password Reset'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='email_otps',
        help_text="User associated with this OTP (if user already exists in DB)."
    )
    email = models.EmailField(
        db_index=True,
        help_text="Recipient email address for the OTP."
    )
    otp_code = models.CharField(
        max_length=6,
        help_text="6-digit verification code."
    )
    purpose = models.CharField(
        max_length=20,
        choices=PURPOSE_CHOICES,
        default='register',
        db_index=True
    )
    is_verified = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether this OTP has been successfully verified."
    )
    attempts = models.PositiveSmallIntegerField(
        default=0,
        help_text="Number of verification attempts made."
    )
    max_attempts = models.PositiveSmallIntegerField(
        default=5,
        help_text="Maximum allowed verification attempts before locking this code."
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True
    )
    expires_at = models.DateTimeField(
        db_index=True,
        help_text="Timestamp when this OTP expires (default 10 minutes from creation)."
    )
    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
        help_text="IP address of the client that requested this OTP."
    )

    class Meta:
        verbose_name = "Email OTP"
        verbose_name_plural = "Email OTPs"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['email', 'purpose', 'is_verified']),
            models.Index(fields=['expires_at']),
        ]

    def __str__(self):
        status = "Verified" if self.is_verified else ("Expired" if self.is_expired else "Pending")
        return f"OTP for {self.email} ({self.purpose}) - {status}"

    @property
    def is_expired(self) -> bool:
        return timezone.now() > self.expires_at

    def is_valid(self) -> tuple[bool, str]:
        """
        Check if the OTP is currently eligible for verification.
        Returns (is_valid, reason_message).
        """
        if self.is_verified:
            return False, "This verification code has already been used."
        if self.is_expired:
            return False, "This verification code has expired. Please request a new code."
        if self.attempts >= self.max_attempts:
            return False, "Maximum verification attempts exceeded. Please request a fresh OTP."
        return True, ""

    def verify(self, code: str) -> tuple[bool, str]:
        """
        Verify the provided 6-digit code against this OTP record.
        Maintains attempt count and single-use integrity.
        """
        valid, reason = self.is_valid()
        if not valid:
            return False, reason

        clean_code = (code or "").strip()
        if clean_code != self.otp_code:
            self.attempts += 1
            self.save(update_fields=['attempts'])
            remaining = max(0, self.max_attempts - self.attempts)
            if remaining == 0:
                return False, "Invalid OTP code. Maximum attempts reached, please request a new code."
            return False, f"Invalid OTP code. {remaining} attempt(s) remaining."

        # Valid OTP!
        self.is_verified = True
        self.save(update_fields=['is_verified'])
        return True, "Verification successful."

    @classmethod
    def create_otp(
        cls,
        email: str,
        purpose: str = 'register',
        user: User | None = None,
        validity_minutes: int = 10,
        ip_address: str | None = None
    ) -> 'EmailOTP':
        """
        Atomically invalidates prior active OTPs for the same email and purpose,
        then generates a cryptographically random 6-digit OTP code.
        """
        clean_email = email.strip().lower()
        now = timezone.now()
        expires = now + timedelta(minutes=validity_minutes)

        # Generate cryptographically secure 6-digit code between 100000 and 999999
        otp_code = str(secrets.randbelow(900000) + 100000)

        with transaction.atomic():
            # Invalidate any existing pending OTPs for this email & purpose
            cls.objects.filter(
                email__iexact=clean_email,
                purpose=purpose,
                is_verified=False
            ).update(is_verified=False, expires_at=now)

            otp_instance = cls.objects.create(
                user=user,
                email=clean_email,
                otp_code=otp_code,
                purpose=purpose,
                is_verified=False,
                attempts=0,
                max_attempts=5,
                expires_at=expires,
                ip_address=ip_address
            )

        return otp_instance


class UserProfile(models.Model):
    """
    User Profile model storing extended profile and email verification status.
    Automatically synced with auth.User via post_save signals.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile'
    )
    is_email_verified = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Designates whether this user has verified their email address."
    )
    email_verified_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp when email verification was completed."
    )
    phone_number = models.CharField(
        max_length=20,
        blank=True,
        default=''
    )
    created_at = models.DateTimeField(
        auto_now_add=True
    )
    updated_at = models.DateTimeField(
        auto_now=True
    )

    class Meta:
        verbose_name = "User Profile"
        verbose_name_plural = "User Profiles"

    def __str__(self):
        status = "Verified" if self.is_email_verified else "Unverified"
        return f"{self.user.username} ({status})"


# Django signals to auto-create and save UserProfile when User is created
from django.db.models.signals import post_save
from django.dispatch import receiver


@receiver(post_save, sender=User)
def create_or_save_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)
    else:
        # Ensure profile exists if user was created before this model
        UserProfile.objects.get_or_create(user=instance)
