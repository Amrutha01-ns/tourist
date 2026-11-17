from django.urls import path
from django.views.i18n import set_language
from . import views

urlpatterns = [
    # Traditional form-based endpoint (backwards compatible)
    path("set-language/", set_language, name="set_language"),

    # Modern JSON API endpoints
    path("api/languages/", views.get_languages, name="i18n_api_languages"),
    path("api/set/", views.set_language_api, name="i18n_api_set"),
]
