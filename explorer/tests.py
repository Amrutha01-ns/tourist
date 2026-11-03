from django.test import TestCase, Client
from django.urls import reverse
from places.models import District, Place, PlaceDetails
from explorer.views import calculate_expense


class ExpenseCalculationAndExplorerTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.district = District.objects.create(name="mysore")
        self.place = Place.objects.create(
            district=self.district,
            name="Mysore Palace",
            slug="mysore",
            category="historical",
            speciality="Royal Heritage",
            description="Famous palace in Mysuru.",
        )
        self.details = PlaceDetails.objects.create(
            place=self.place,
            opening_hours="10:00 AM - 5:30 PM",
            ticket_price="₹100",
        )

    def test_calculate_expense_formula(self):
        # 2 travellers, 2 days, ₹5000 budget
        # Food: 2 * 2 * 300 = 1200
        # Stay: 2 * 2 * 500 = 2000
        # Transport: 2 * 200 = 400
        # Activities: 2 * 2 * 100 = 400
        # Total: 4000, Remaining: 1000
        result = calculate_expense(budget=5000, travellers=2, days=2)
        self.assertEqual(result["food"], 1200)
        self.assertEqual(result["stay"], 2000)
        self.assertEqual(result["transport"], 400)
        self.assertEqual(result["activities"], 400)
        self.assertEqual(result["total"], 4000)
        self.assertEqual(result["remaining"], 1000)

    def test_place_detail_get(self):
        url = reverse("explorer:place_detail", kwargs={"slug": self.place.slug})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Mysore Palace")
        self.assertContains(response, "Public Transportation")
        self.assertIn("transit", response.context)
        self.assertIn("place_details", response.context)

    def test_place_detail_post_valid_expense(self):
        url = reverse("explorer:place_detail", kwargs={"slug": self.place.slug})
        response = self.client.post(url, {
            "budget": "6000",
            "travellers": "2",
            "days": "2",
            "origin": "Bengaluru",
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("expense", response.context)
        self.assertEqual(response.context["expense"]["total"], 4000)
        self.assertEqual(response.context["expense"]["remaining"], 2000)
        # Ensure destination and transit context remain attached
        self.assertEqual(response.context["place"], self.place)
        self.assertIn("transit", response.context)

    def test_place_detail_post_invalid_budget(self):
        url = reverse("explorer:place_detail", kwargs={"slug": self.place.slug})
        response = self.client.post(url, {
            "budget": "500",  # below minimum 1000
            "travellers": "2",
            "days": "2",
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("error", response.context)
        self.assertIsNone(response.context["expense"])

    def test_place_detail_ajax_transit(self):
        url = reverse("explorer:place_detail", kwargs={"slug": self.place.slug})
        response = self.client.get(
            f"{url}?action=transit&origin=Bengaluru",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["place_slug"], "mysore")
        self.assertEqual(data["transit_hub"], "Mysuru")
        self.assertIn("total_routes_found", data)

    def test_place_detail_uses_basepanel_navbar(self):
        url = reverse("explorer:place_detail", kwargs={"slug": self.place.slug})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'class="brand"')
        self.assertContains(response, 'class="brand-logo"')
        self.assertContains(response, 'id="accountBtn"')
        self.assertContains(response, 'id="accountMenu"')

    def test_krs_dam_detail_shows_direct_bus_numbers(self):
        krs_place = Place.objects.create(
            district=self.district,
            name="KRS Dam",
            slug="krs-dam",
            category="watery",
            speciality="Iconic Dam & Brindavan Gardens",
            description="Famous reservoir near Mysuru.",
        )
        url = reverse("explorer:place_detail", kwargs={"slug": krs_place.slug})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Bus 301")
        self.assertContains(response, "Bus 307")
        self.assertContains(response, "Direct Available Bus Numbers & Routes")
        self.assertContains(response, "City Bus Stand (CBS) - Bay 7")
        self.assertContains(response, "Boarding Advice & Direct Route Tips")

    def test_rajajinagar_to_krs_dam_multi_leg_router(self):
        krs_place = Place.objects.create(
            district=self.district,
            name="KRS Dam",
            slug="krs-dam-multi",
            category="watery",
            speciality="Iconic Dam",
            description="Famous reservoir.",
        )
        url = reverse("explorer:place_detail", kwargs={"slug": krs_place.slug})
        response = self.client.get(
            f"{url}?action=transit&origin=Rajajinagar",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["journey_summary"]["total_transfers"], 2)
        self.assertIn("journey_legs", data)
        self.assertEqual(len(data["journey_legs"]), 3)
        self.assertIn("map_data", data)
        self.assertTrue(len(data["map_data"]["segments"]) >= 3)
        self.assertIn("BMTC", data["journey_legs"][0]["provider_code"])
        self.assertIn("KSRTC", data["journey_legs"][1]["provider_code"])

    def test_airport_to_krs_dam_flybus_routing(self):
        krs_place = Place.objects.create(
            district=self.district,
            name="KRS Dam",
            slug="krs-dam-airport",
            category="watery",
            speciality="Iconic Dam",
            description="Famous reservoir.",
        )
        url = reverse("explorer:place_detail", kwargs={"slug": krs_place.slug})
        response = self.client.get(
            f"{url}?action=transit&origin=Airport",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["journey_summary"]["total_transfers"], 1)
        self.assertIn("FLYBUS", data["journey_legs"][0]["bus_number"])

    def test_gps_coordinate_routing(self):
        url = reverse("explorer:place_detail", kwargs={"slug": self.place.slug})
        response = self.client.get(
            f"{url}?action=transit&lat=12.9844&lng=77.5540",
            HTTP_X_REQUESTED_WITH="XMLHttpRequest"
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("map_data", data)
        self.assertTrue(len(data["map_data"]["waypoints"]) > 0)
        self.assertTrue(data.get("is_origin_gps"))

