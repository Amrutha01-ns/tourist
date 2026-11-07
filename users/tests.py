from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth.models import User
from django.core import mail
from users.services import send_otp_email, generate_otp


class EmailVerificationAndAuthTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.test_user = User.objects.create_user(
            username="traveler1",
            email="traveler1@example.com",
            password="secretpassword123"
        )

    def test_send_otp_email_format(self):
        """Verifies simple message content with exact user request phrase."""
        mail.outbox = []
        send_otp_email("test@example.com", "654321", purpose="sign in")
        self.assertTrue(len(mail.outbox) > 0)
        sent_email = mail.outbox[0]
        self.assertIn("hey hi,,we tourist web here", sent_email.body)
        self.assertIn("654321", sent_email.body)
        self.assertEqual(sent_email.to, ["test@example.com"])

    def test_register_step1_sends_otp(self):
        mail.outbox = []
        response = self.client.post(reverse("register"), {
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "mypassword123",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["step"], "otp")
        self.assertIn("n*****r@example.com", response.context["masked_email"])
        self.assertTrue(len(mail.outbox) > 0)
        self.assertIn("hey hi,,we tourist web here", mail.outbox[0].body)
        # User not created until OTP verified
        self.assertFalse(User.objects.filter(username="newuser").exists())

    def test_register_invalid_otp_fails(self):
        self.client.post(reverse("register"), {
            "username": "newuser2",
            "email": "newuser2@example.com",
            "password": "mypassword123",
        })
        response = self.client.post(reverse("register"), {
            "action": "verify_otp",
            "otp": "000000",  # wrong OTP
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("Invalid OTP code", response.context["error"])
        self.assertFalse(User.objects.filter(username="newuser2").exists())

    def test_register_valid_otp_creates_user_and_redirects_to_dashboard(self):
        self.client.post(reverse("register"), {
            "username": "newuser3",
            "email": "newuser3@example.com",
            "password": "mypassword123",
        })
        session = self.client.session
        otp = session["reg_otp"]

        response = self.client.post(reverse("register"), {
            "action": "verify_otp",
            "otp": otp,
        })
        # Verifies that it redirects straight to dashboard ("fix that dash page of register page")
        self.assertRedirects(response, reverse("dashboard"))
        created_user = User.objects.filter(username="newuser3").first()
        self.assertIsNotNone(created_user)
        self.assertEqual(created_user.email, "newuser3@example.com")

    def test_login_valid_credentials_triggers_otp_step(self):
        mail.outbox = []
        response = self.client.post(reverse("login"), {
            "username": "traveler1",
            "password": "secretpassword123",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["step"], "otp")
        self.assertTrue(len(mail.outbox) > 0)
        self.assertIn("hey hi,,we tourist web here", mail.outbox[0].body)
        session = self.client.session
        self.assertIn("login_otp", session)
        self.assertEqual(session["pending_login_user_id"], self.test_user.id)

    def test_login_invalid_password_shows_error(self):
        response = self.client.post(reverse("login"), {
            "username": "traveler1",
            "password": "wrongpassword",
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.context["step"], "credentials")
        self.assertIn("error", response.context)
        self.assertNotIn("login_otp", self.client.session)

    def test_login_valid_otp_completes_sign_in_and_redirects_to_dashboard(self):
        # Trigger OTP
        self.client.post(reverse("login"), {
            "username": "traveler1",
            "password": "secretpassword123",
        })
        session = self.client.session
        login_otp = session["login_otp"]

        # Verify OTP
        response = self.client.post(reverse("login"), {
            "action": "verify_otp",
            "otp": login_otp,
        })
        self.assertRedirects(response, reverse("dashboard"))
        # Verify authenticated in session
        self.assertEqual(int(self.client.session["_auth_user_id"]), self.test_user.id)

    def test_login_invalid_otp_fails(self):
        self.client.post(reverse("login"), {
            "username": "traveler1",
            "password": "secretpassword123",
        })
        response = self.client.post(reverse("login"), {
            "action": "verify_otp",
            "otp": "999999",  # wrong OTP
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("Invalid OTP", response.context["error"])

    def test_pages_have_back_to_dashboard_link(self):
        login_resp = self.client.get(reverse("login"))
        self.assertEqual(login_resp.status_code, 200)
        self.assertContains(login_resp, "Back to Dashboard")

        reg_resp = self.client.get(reverse("register"))
        self.assertEqual(reg_resp.status_code, 200)
        self.assertContains(reg_resp, "Back to Dashboard")
