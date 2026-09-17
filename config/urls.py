from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),

    path("users/", include("users.urls")),
    path("places/", include("places.urls")),
    path("transport/", include("transport_finder.urls")),

    # New main dashboard
    path("", include("explorer.urls")),
]