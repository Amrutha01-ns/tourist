from rest_framework import serializers

from .models import (
    TransportProvider,
    TransitStop,
    Route,
    Trip,
    StopTime,
    Fare,
)


class TransportProviderSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransportProvider
        fields = "__all__"


class TransitStopSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransitStop
        fields = "__all__"


class RouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Route
        fields = "__all__"


class TripSerializer(serializers.ModelSerializer):
    class Meta:
        model = Trip
        fields = "__all__"


class StopTimeSerializer(serializers.ModelSerializer):
    class Meta:
        model = StopTime
        fields = "__all__"


class FareSerializer(serializers.ModelSerializer):
    class Meta:
        model = Fare
        fields = "__all__"