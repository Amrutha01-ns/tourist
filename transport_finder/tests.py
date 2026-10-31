from django.test import TestCase, Client
from django.urls import reverse
from places.models import District, Place
from transport_finder.models import TransportProvider, TransitStop, Route, RouteStop
from transport_finder.services import resolve_destination_transit, nearby_stops


class TransportFinderTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.provider_ksrtc = TransportProvider.objects.create(
            name="Karnataka State Road Transport Corporation",
            code="KSRTC"
        )
        self.provider_mitra = TransportProvider.objects.create(
            name="Mysuru MITRA",
            code="MITRA"
        )

        self.stop_blr = TransitStop.objects.create(
            provider=self.provider_ksrtc,
            stop_id="KSRTC-BLR",
            name="Bengaluru",
            latitude=12.9716,
            longitude=77.5946
        )
        self.stop_mys = TransitStop.objects.create(
            provider=self.provider_ksrtc,
            stop_id="KSRTC-MYS",
            name="Mysuru",
            latitude=12.2958,
            longitude=76.6394
        )
        self.stop_palace = TransitStop.objects.create(
            provider=self.provider_mitra,
            stop_id="OSM-PALACE",
            name="Palace Bus Stop",
            latitude=12.3050,
            longitude=76.6550
        )

        # Route BLR -> MYS
        self.route_intercity = Route.objects.create(
            provider=self.provider_ksrtc,
            route_id="BLR-MYS",
            route_name="Bengaluru → Mysuru"
        )
        RouteStop.objects.create(route=self.route_intercity, stop=self.stop_blr, stop_sequence=1)
        RouteStop.objects.create(route=self.route_intercity, stop=self.stop_mys, stop_sequence=2)

        # Route MITRA
        self.route_local = Route.objects.create(
            provider=self.provider_mitra,
            route_id="MYS-116",
            route_name="116: CBS => LnT"
        )
        RouteStop.objects.create(route=self.route_local, stop=self.stop_palace, stop_sequence=1)
        RouteStop.objects.create(route=self.route_local, stop=self.stop_mys, stop_sequence=2)

        self.district_mys = District.objects.create(name="mysore")
        self.place_mysore = Place.objects.create(
            district=self.district_mys,
            name="Mysore Palace",
            slug="mysore",
            category="historical",
        )
        self.place_krs = Place.objects.create(
            district=self.district_mys,
            name="KRS Dam",
            slug="krs-dam",
            category="watery",
        )

    def test_nearby_stops_geographic(self):
        # Coordinates very close to Bengaluru stop
        stops = nearby_stops(12.9720, 77.5950, radius_km=5)
        self.assertTrue(len(stops) > 0)
        self.assertEqual(stops[0]["stop"].name, "Bengaluru")

    def test_resolve_transit_for_mysore_palace(self):
        result = resolve_destination_transit(self.place_mysore, origin_name="Bengaluru")
        self.assertEqual(result["place_slug"], "mysore")
        self.assertEqual(result["transit_hub"], "Mysuru")
        self.assertEqual(result["status"], "covered")
        self.assertTrue(len(result["direct_routes"]) > 0 or len(result["hub_routes"]) > 0)
        self.assertIn("data_disclaimer", result)

    def test_resolve_transit_for_krs_dam_hub_connected(self):
        result = resolve_destination_transit(self.place_krs, origin_name="Bengaluru")
        self.assertEqual(result["place_slug"], "krs-dam")
        self.assertEqual(result["transit_hub"], "Mysuru")
        self.assertEqual(result["status"], "hub_connected")
        self.assertIn("19 km", result["hub_distance"])

    def test_destination_transit_api_endpoint(self):
        url = reverse("destination_transit", kwargs={"slug": self.place_mysore.slug})
        response = self.client.get(f"{url}?origin=Bengaluru")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["place_slug"], "mysore")
        self.assertEqual(data["transit_hub"], "Mysuru")
