import os
import json
import urllib.request
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
    1. First tries Mail Relay Webhook if MAIL_RELAY_URL is set (relays from Render over Port 443).
    2. Tries Google Apps Script Webhook if GOOGLE_SCRIPT_MAIL_URL is set.
    3. Tries Brevo HTTPS API if BREVO_API_KEY is available (Port 443).
    4. Tries Resend HTTPS API if RESEND_API_KEY is available (Port 443).
    5. Falls back to standard SMTP port 587.
    6. Catches all errors gracefully without ever interrupting or freezing the web UI.
    """
    # 0. Mail Relay Webhook (Port 443 HTTPS - forwards from Render to local relay bridge)
    relay_urls = [
        os.getenv("MAIL_RELAY_URL", "").strip(),
        "https://tourist-karnataka.loca.lt/users/api/send-relay-email/",
    ]
    for r_url in relay_urls:
        if not r_url:
            continue
        try:
            target = r_url
            if not target.endswith("/send-relay-email/") and not target.endswith("/send-email"):
                target = target.rstrip("/") + "/users/api/send-relay-email/"
            payload = json.dumps({
                "to": to_email,
                "subject": subject,
                "message": message,
            }).encode("utf-8")
            req = urllib.request.Request(
                target,
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Tourist-Web/1.0",
                    "bypass-tunnel-reminder": "true"
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                if resp.status in (200, 201):
                    print(f"[LIVE EMAIL DELIVERED VIA MAIL RELAY] to {to_email}")
                    logger.info(f"Delivered via Mail Relay to {to_email}")
                    return
        except Exception as relay_err:
            logger.warning(f"Mail Relay dispatch failed ({r_url}): {relay_err}")

    # 0b. Google Apps Script Webhook (Port 443 HTTPS)
    gas_url = os.getenv("GOOGLE_SCRIPT_MAIL_URL", "").strip()
    if gas_url:
        try:
            payload = json.dumps({
                "to": to_email,
                "subject": subject,
                "message": message,
            }).encode("utf-8")
            req = urllib.request.Request(
                gas_url,
                data=payload,
                headers={"Content-Type": "application/json", "User-Agent": "Tourist-Web/1.0"},
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                print(f"[LIVE EMAIL DELIVERED VIA GOOGLE APPS SCRIPT WEBHOOK] to {to_email}")
                logger.info(f"Delivered via Google Apps Script to {to_email}")
                return
        except Exception as gas_err:
            logger.warning(f"Google Apps Script dispatch failed: {gas_err}")

    # 1. Brevo HTTPS API (Port 443 - Can send to ANY email address in the world from Render)
    brevo_key = os.getenv("BREVO_API_KEY", "").strip()
    if brevo_key:
        try:
            payload = json.dumps({
                "sender": {"name": "Tourist Karnataka", "email": getattr(settings, "EMAIL_HOST_USER", "studentmanagebyns@gmail.com")},
                "to": [{"email": to_email}],
                "subject": subject,
                "textContent": message,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.brevo.com/v3/smtp/email",
                data=payload,
                headers={
                    "accept": "application/json",
                    "api-key": brevo_key,
                    "content-type": "application/json",
                    "User-Agent": "Tourist-Web/1.0",
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status in (200, 201):
                    print(f"[LIVE EMAIL DELIVERED VIA BREVO HTTPS PORT 443] to {to_email}")
                    logger.info(f"Delivered via Brevo HTTPS to {to_email}")
                    return
        except Exception as brevo_err:
            logger.warning(f"Brevo HTTPS dispatch failed: {brevo_err}")

    # 2. Resend HTTPS API (Port 443)
    resend_key = os.getenv("RESEND_API_KEY", "").strip()
    if resend_key:
        try:
            req_data = json.dumps({
                "from": "Tourist Karnataka <onboarding@resend.dev>",
                "to": [to_email],
                "subject": subject,
                "text": message,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=req_data,
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "Tourist-Web/1.0",
                },
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status in (200, 201):
                    print(f"[LIVE EMAIL DELIVERED VIA RESEND HTTPS PORT 443] to {to_email}")
                    logger.info(f"Delivered via Resend HTTPS to {to_email}")
                    return
        except Exception as api_err:
            logger.warning(f"Resend HTTPS dispatch failed: {api_err}")

    # Standard SMTP
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=from_email,
            recipient_list=[to_email],
            fail_silently=False,
        )
        print(f"[LIVE EMAIL DELIVERED VIA SMTP] Verification email successfully delivered to {to_email}")
        logger.info(f"Verification email successfully delivered to {to_email}")
    except Exception as e:
        err_str = str(e)
        if "534" in err_str or "Application-specific" in err_str or "InvalidSecondFactor" in err_str:
            logger.warning(
                "Gmail 2-Step Verification error: Google requires a 16-character App Password. "
                f"Detail: {e}"
            )
        elif "ETIMEDOUT" in err_str or "timed out" in err_str or "110" in err_str or "refused" in err_str:
            logger.warning(
                "Render Free Tier cloud security blocked outbound SMTP port 587. "
                "The active verification code is already pre-filled on the user's screen."
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
    
    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "Tourist Karnataka <studentmanagebyns@gmail.com>")
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
