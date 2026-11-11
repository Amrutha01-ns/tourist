from django.urls import path
from django.shortcuts import redirect
from . import views

urlpatterns = [
    path("", lambda request: redirect("dashboard")),
    path("api/nearest-district/", views.nearest_district_api, name="nearest_district_api"),
    path("register/", views.register, name="register"),
    path("login/", views.user_login, name="login"),
    path("dashboard/", views.dashboard, name="dashboard"),
    path("places/<str:district_name>/", views.places_by_district, name="places_by_district"),
    path("api/send-relay-email/", views.send_relay_email_api, name="send_relay_email_api"),
    path("logout/", views.logout_view, name="logout"),
]