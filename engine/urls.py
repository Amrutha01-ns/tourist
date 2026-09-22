# engine/urls.py
from django.urls import path

from . import views

app_name = "engine"

urlpatterns = [
    path("plan/", views.estimate_trip, name="plan_trip"),
]