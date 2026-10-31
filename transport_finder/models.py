from django.db import models


class TransportProvider(models.Model):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=30, unique=True)

    def __str__(self):
        return self.name


class TransitStop(models.Model):
    provider = models.ForeignKey(
        TransportProvider,
        on_delete=models.CASCADE,
        related_name="stops"
    )
    stop_id = models.CharField(max_length=100)
    name = models.CharField(max_length=200)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "stop_id"],
                name="unique_provider_stop"
            )
        ]

    def __str__(self):
        return self.name


class Route(models.Model):
    provider = models.ForeignKey(
        TransportProvider,
        on_delete=models.CASCADE,
        related_name="routes"
    )
    route_id = models.CharField(max_length=100)
    route_name = models.CharField(max_length=200)

    def __str__(self):
        return self.route_name


class Trip(models.Model):
    route = models.ForeignKey(
        Route,
        on_delete=models.CASCADE,
        related_name="trips"
    )
    trip_id = models.CharField(max_length=100)
    service_id = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return self.trip_id


class StopTime(models.Model):
    trip = models.ForeignKey(
        Trip,
        on_delete=models.CASCADE,
        related_name="stop_times"
    )
    stop = models.ForeignKey(
        TransitStop,
        on_delete=models.CASCADE,
        related_name="stop_times"
    )
    arrival_time = models.CharField(max_length=20)
    departure_time = models.CharField(max_length=20)
    stop_sequence = models.PositiveIntegerField()

    class Meta:
        ordering = ["stop_sequence"]


class Fare(models.Model):
    provider = models.ForeignKey(
        TransportProvider,
        on_delete=models.CASCADE,
        related_name="fares"
    )
    fare_id = models.CharField(max_length=100)
    price = models.DecimalField(
        max_digits=8,
        decimal_places=2
    )
    currency = models.CharField(max_length=10, default="INR")

    def __str__(self):
        return f"{self.fare_id} - ₹{self.price}"


class RouteStop(models.Model):
    route = models.ForeignKey(
        Route,
        on_delete=models.CASCADE,
        related_name="route_stops"
    )
    stop = models.ForeignKey(
        TransitStop,
        on_delete=models.CASCADE,
        related_name="route_stops"
    )
    stop_sequence = models.PositiveIntegerField()

    class Meta:
        ordering = ["stop_sequence"]
        unique_together = ("route", "stop")

    def __str__(self):
        return f"{self.route.route_name} - {self.stop.name}"
