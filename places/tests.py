from django.test import TestCase, Client
from django.urls import reverse
from places.models import District, Place, PlaceDetails


class PlacesModelAndViewsTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.district = District.objects.create(name="mysore")
        self.place1 = Place.objects.create(
            district=self.district,
            name="Mysore Palace",
            category="historical",
            speciality="Grand Royal Palace",
            description="Heritage palace of Wadiyars.",
        )
        self.place2 = Place.objects.create(
            district=self.district,
            name="Karanji Lake",
            category="watery",
            speciality="Scenic lake and aviary",
            description="Peaceful lake near Chamundi hills.",
        )
        self.details = PlaceDetails.objects.create(
            place=self.place1,
            opening_hours="10:00 AM–5:30 PM",
            weekly_holidays="None",
            ticket_price="₹100 for adults",
            facilities="Restrooms, Cloakroom, Guided tours",
            source_url="https://karnatakatourism.org",
        )

    def test_district_str(self):
        self.assertEqual(str(self.district), "mysore")

    def test_place_slug_auto_generated(self):
        self.assertTrue(self.place1.slug)
        self.assertEqual(self.place1.slug, "mysore-palace")

    def test_placedetails_str_and_properties(self):
        self.assertIn("Mysore Palace", str(self.details))
        self.assertFalse(self.details.is_verified)  # last_verified is None

    def test_places_by_district_view_all(self):
        response = self.client.get(reverse("places_by_district", args=["mysore"]))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Mysore Palace")
        self.assertContains(response, "Karanji Lake")

    def test_places_by_district_view_filtered(self):
        response = self.client.get(reverse("places_by_district", args=["mysore"]), {"category": "watery"})
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Karanji Lake")
        self.assertNotContains(response, "Mysore Palace")
