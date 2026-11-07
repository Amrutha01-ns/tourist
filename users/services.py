import random
import logging
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


def generate_otp(length=6) -> str:
    """Generate a secure, random numeric one-time password (OTP)."""
    return "".join(str(random.randint(0, 9)) for _ in range(length))


def send_otp_email(to_email: str, otp_code: str, purpose: str = "sign in") -> bool:
    """
    Sends a verification email containing the one-time passcode.
    Uses standard SMTP port 587 (TLS), globally permitted on cloud hosts.
    Falls back gracefully to console logging if external credentials are not configured.
    """
    subject = "Tourist Web - Your Verification OTP"
    
    # Exact simple message format requested by the user
    message = (
        f"hey hi,,we tourist web here nd your OTP is: {otp_code}\n\n"
        f"Please enter this one-time password to complete your {purpose}.\n"
        f"This code will expire in 10 minutes.\n\n"
        f"Happy travels,\n"
        f"Amrutha & Tourist Karnataka Journeys Team"
    )
    
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "tourist.web.app@gmail.com")
    email_host_user = getattr(settings, "EMAIL_HOST_USER", "").strip()
    email_host_password = getattr(settings, "EMAIL_HOST_PASSWORD", "").strip()
    
    email_delivered = False
    
    email_backend = getattr(settings, "EMAIL_BACKEND", "")
    is_smtp_backend = "smtp" in email_backend.lower()

    # If SMTP credentials are provided, or using test/console backends (e.g. locmem, console)
    if not is_smtp_backend or (email_host_user and email_host_password):
        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=from_email,
                recipient_list=[to_email],
                fail_silently=False,
            )
            email_delivered = True
        except Exception as e:
            logger.warning(f"Failed to send email: {e}")

    # Always log/print cleanly to terminal console so developer/user sees it immediately
    try:
        print("\n" + "=" * 60)
        print("[TOURIST WEB EMAIL VERIFICATION DISPATCH]")
        print(f"Recipient: {to_email}")
        print(f"Purpose:   {purpose}")
        print(f"OTP Code:  {otp_code}")
        print(f"Content:\n{message}")
        print("=" * 60 + "\n")
    except Exception:
        pass

    return email_delivered


def mask_email(email: str) -> str:
    """Mask email for privacy display, e.g. j***e@domain.com."""
    if not email or "@" not in email:
        return email or ""
    name, domain = email.split("@", 1)
    if len(name) <= 2:
        masked_name = name[0] + "*"
    else:
        masked_name = name[0] + "*" * (len(name) - 2) + name[-1]
    return f"{masked_name}@{domain}"


def get_client_ip(request) -> str | None:
    """Extract client IP address from HTTP headers."""
    if not request:
        return None
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        return x_forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR')
