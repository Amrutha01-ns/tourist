from django.contrib import admin
from django.urls import path, include, re_path
from django.shortcuts import redirect
from users.views import places_by_district
from django.conf import settings
from django.conf.urls.static import static
from django.views.static import serve

urlpatterns = [
    path("", lambda request: redirect("dashboard")),
    path("admin/", admin.site.urls),
    path("users/", include("users.urls")),
    path("places/<str:district_name>/", places_by_district, name="places_by_district"),
    path("transport/", include("transport_finder.urls")),
    path("explorer/", include("explorer.urls")),
    path("engine/", include("engine.urls")),
    path("expenses/", include("expenses.urls")),
    path("i18n/", include("universal_i18n.urls")),
    re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
