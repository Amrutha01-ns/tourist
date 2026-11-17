import json
from django.conf import settings
from django.test import Client, TestCase
from django.urls import reverse


class UniversalI18nApiTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_get_languages_api(self):
        """GET /i18n/api/languages/ should return list of available languages."""
        url = reverse("i18n_api_languages")
        response = self.client.get(url)

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertIn("current", data)
        self.assertIn("languages", data)

        language_codes = [lang["code"] for lang in data["languages"]]
        self.assertIn("en", language_codes)
        self.assertIn("kn", language_codes)
        self.assertIn("hi", language_codes)

    def test_set_language_api_json_success(self):
        """POST /i18n/api/set/ with valid JSON should set language cookie and return 200."""
        url = reverse("i18n_api_set")
        response = self.client.post(
            url,
            data=json.dumps({"language": "hi"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["language"], "hi")

        # Verify cookie is set
        cookie_name = getattr(settings, "LANGUAGE_COOKIE_NAME", "django_language")
        self.assertIn(cookie_name, response.cookies)
        self.assertEqual(response.cookies[cookie_name].value, "hi")

    def test_set_language_api_form_encoded_success(self):
        """POST /i18n/api/set/ with form-encoded data should also work seamlessly."""
        url = reverse("i18n_api_set")
        response = self.client.post(url, data={"language": "kn"})

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["language"], "kn")

    def test_set_language_api_invalid_code(self):
        """POST /i18n/api/set/ with unsupported language should return 400 error."""
        url = reverse("i18n_api_set")
        response = self.client.post(
            url,
            data=json.dumps({"language": "xx-invalid"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertEqual(data["status"], "error")

    def test_set_language_api_missing_language(self):
        """POST /i18n/api/set/ with empty data should return 400 error."""
        url = reverse("i18n_api_set")
        response = self.client.post(
            url,
            data=json.dumps({}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertEqual(data["status"], "error")
