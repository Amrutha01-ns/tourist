from django.contrib import admin
from .models import District, Place


@admin.register(District)
class DistrictAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "name",
    )

    search_fields = (
        "name",
    )


@admin.register(Place)
class PlaceAdmin(admin.ModelAdmin):

    list_display = (
        "id",
        "name",
        "district",
        "category",
        "speciality",
    )

    search_fields = (
        "name",
        "district__name",
        "speciality",
    )

    list_filter = (
        "district",
        "category",
    )