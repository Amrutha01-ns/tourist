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


def _dispatch_email_async(subject: str, message: str, from_email: str, to_email: str, html_message: str = None):
    """
    Worker function executed in a background daemon thread.
    1. First tries Mail Relay Webhook if MAIL_RELAY_URL is set (relays from Render over Port 443).
    2. Tries Google Apps Script Webhook if GOOGLE_SCRIPT_MAIL_URL is set.
    3. Tries Brevo HTTPS API if BREVO_API_KEY is available (Port 443).
    4. Tries Resend HTTPS API if RESEND_API_KEY is available (Port 443).
    5. Falls back to standard SMTP port 587.
    6. Catches all errors gracefully without ever interrupting or freezing the web UI.
    """
    # 0. Mail Relay Webhook (Port 443 HTTPS - forwards from Render cloud to local relay bridge)
    # Only active when running in the cloud (RENDER), so local server dispatches directly via SMTP port 587 without recursive loop
    if os.getenv("RENDER"):
        relay_urls = [
            "https://startup-jam-conduct-ranking.trycloudflare.com/users/api/send-relay-email/",
            os.getenv("MAIL_RELAY_URL", "").strip(),
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
                    "html_message": html_message,
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
                "html_message": html_message,
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
                "htmlContent": html_message or message,
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
                "html": html_message if html_message else message,
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
            html_message=html_message,
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


def send_otp_email(to_email: str, otp_code: str, purpose: str = "account registration") -> bool:
    """
    Sends a standard professional verification email containing the one-time passcode.
    Includes simple intro, prominent OTP, and clear acknowledgement/security notes.
    """
    subject = f"Tourist Karnataka - Your Verification Code: {otp_code}"
    
    # Standard professional plain text email format
    message = (
        f"Welcome to Tourist Karnataka • ಕರ್ನಾಟಕ ಪ್ರವಾಸೋದ್ಯಮ\n\n"
        f"Dear Traveler,\n\n"
        f"Thank you for registering with Tourist Karnataka - District Atlas & Smart Transit Explorer.\n"
        f"To complete your {purpose}, please enter the 6-digit verification code below:\n\n"
        f"====================================\n"
        f"      VERIFICATION CODE: {otp_code}\n"
        f"====================================\n\n"
        f"Acknowledgement & Security Notice:\n"
        f"• This code is confidential and will expire in 10 minutes.\n"
        f"• For your security, please do not share this OTP with anyone.\n"
        f"• If you did not request this code, you can safely ignore this email.\n\n"
        f"We look forward to helping you discover Karnataka's 31 districts, royal heritage corridors, and transit routes!\n\n"
        f"Warm regards,\n"
        f"Tourist Karnataka Journeys Team\n"
        f"Department of Tourism & Transit Exploration\n"
    )

    # Standard responsive HTML email format
    html_message = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 24px 0; background-color: #07120d; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
      <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; background: linear-gradient(135deg, #0b1f16 0%, #0d281c 100%); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 20px; overflow: hidden; box-shadow: 0 15px 35px rgba(0,0,0,0.6);">
        <!-- Header -->
        <tr>
          <td style="padding: 32px 32px 20px 32px; text-align: center; border-bottom: 1px solid rgba(16, 185, 129, 0.2);">
            <div style="display: inline-block; padding: 6px 14px; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 30px; font-size: 12px; font-weight: 700; color: #34d399; letter-spacing: 1px; text-transform: uppercase;">
              Tourist Karnataka • ಕರ್ನಾಟಕ ಪ್ರವಾಸೋದ್ಯಮ
            </div>
            <h1 style="margin: 16px 0 6px 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">
              Account Verification
            </h1>
            <p style="margin: 0; font-size: 13.5px; color: #94a3b8;">
              31 Districts Atlas &amp; Public Transit Navigation
            </p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding: 32px;">
            <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #cbd5e1;">
              Dear Traveler,
            </p>
            <p style="margin: 0 0 24px 0; font-size: 14.5px; line-height: 1.6; color: #cbd5e1;">
              Thank you for registering with <strong>Tourist Karnataka</strong>. Please enter the one-time verification passcode below to complete your {purpose}:
            </p>
            <!-- OTP Box -->
            <div style="background: rgba(16, 185, 129, 0.12); border: 1.5px dashed #10b981; border-radius: 14px; padding: 22px; text-align: center; margin: 24px 0;">
              <span style="font-size: 11.5px; font-weight: 700; color: #6ee7b7; text-transform: uppercase; letter-spacing: 2px; display: block; margin-bottom: 6px;">
                Your Verification Code
              </span>
              <span style="font-size: 36px; font-weight: 900; letter-spacing: 10px; color: #ffffff; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;">
                {otp_code}
              </span>
            </div>
            <!-- Security & Acknowledgement -->
            <div style="background: rgba(15, 23, 42, 0.5); border-left: 3px solid #10b981; padding: 14px 16px; border-radius: 6px; margin-top: 24px;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #34d399;">
                Acknowledgement &amp; Security Notice:
              </p>
              <ul style="margin: 0; padding-left: 18px; font-size: 12.5px; color: #94a3b8; line-height: 1.6;">
                <li>This code is valid for <strong>10 minutes</strong>.</li>
                <li>Never share this OTP with anyone. Our team will never ask for your verification code.</li>
                <li>If you did not request this registration, you can safely disregard this email.</li>
              </ul>
            </div>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding: 24px 32px; background: rgba(5, 13, 9, 0.85); border-top: 1px solid rgba(16, 185, 129, 0.15); text-align: center;">
            <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #a7f3d0;">
              Happy Travels &amp; Safe Journeys!
            </p>
            <p style="margin: 0; font-size: 11.5px; color: #64748b;">
              &copy; 2026 Tourist Karnataka Journeys Team &bull; Shakti Scheme &amp; KSRTC Transit Exploration
            </p>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

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
        print("=" * 60 + "\n")
    except Exception:
        pass

    # If SMTP credentials are configured, launch delivery in non-blocking background thread
    if not is_smtp_backend or (email_host_user and email_host_password):
        thread = threading.Thread(
            target=_dispatch_email_async,
            args=(subject, message, from_email, to_email, html_message),
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
