from django.contrib import admin
from .models import (
    TransportProvider,
    TransitStop,
    Route,
    Trip,
    StopTime,
    Fare,
)

admin.site.register(TransportProvider)
admin.site.register(TransitStop)
admin.site.register(Route)
admin.site.register(Trip)
admin.site.register(StopTime)
admin.site.register(Fare)