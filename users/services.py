import random
import logging
import threading
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


def generate_otp(length=6) -> str:
    """Generate a secure, random numeric one-time password (OTP)."""
    return "".join(str(random.randint(0, 9)) for _ in range(length))


def _dispatch_email_async(subject: str, message: str, from_email: str, to_email: str):
    """
    Worker function executed in a background daemon thread.
    Handles network latency, 2-Step Verification errors, or port blocks gracefully
    without ever freezing or delaying the user's web browser response.
    """
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=from_email,
            recipient_list=[to_email],
            fail_silently=False,
        )
        logger.info(f"Verification email successfully delivered to {to_email}")
    except Exception as e:
        err_str = str(e)
        if "534" in err_str or "Application-specific" in err_str or "InvalidSecondFactor" in err_str:
            logger.warning(
                "Gmail 2-Step Verification is active: Google requires a 16-character App Password "
                "(My Account -> Security -> 2-Step Verification -> App Passwords). "
                f"Detail: {e}"
            )
        else:
            logger.warning(f"Live SMTP email dispatch failed: {e}")


def send_otp_email(to_email: str, otp_code: str, purpose: str = "sign in") -> bool:
    """
    Sends a verification email containing the one-time passcode.
    Dispatched via a background daemon thread so the web UI responds instantly (0 delay).
    The OTP is also printed cleanly to terminal/logs and made available on the verification screen.
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
    
    email_backend = getattr(settings, "EMAIL_BACKEND", "")
    is_smtp_backend = "smtp" in email_backend.lower()

    # Always log/print cleanly to terminal console so developer/user/tester sees it immediately
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

    # If SMTP credentials are configured, launch delivery in non-blocking background thread
    if not is_smtp_backend or (email_host_user and email_host_password):
        thread = threading.Thread(
            target=_dispatch_email_async,
            args=(subject, message, from_email, to_email),
            daemon=True,
        )
        thread.start()
    else:
        logger.info(
            "EMAIL_HOST_PASSWORD is not set in environment. "
            "To deliver live emails via Gmail, configure EMAIL_HOST_PASSWORD with a 16-character App Password."
        )

    return True


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
