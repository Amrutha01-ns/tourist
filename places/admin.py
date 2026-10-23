
from django.contrib import admin
from .models import District, Place, PlaceDetails


@admin.register(District)
class DistrictAdmin(admin.ModelAdmin):
    list_display = ("id", "name")
    search_fields = ("name",)


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

    list_filter = ("district", "category")


@admin.register(PlaceDetails)
class PlaceDetailsAdmin(admin.ModelAdmin):
    list_display = (
        "place",
        "last_verified",
        "source_url",
    )

    search_fields = (
        "place__name",
        "place__district__name",
    )

    list_filter = ("last_verified",)
    autocomplete_fields = ("place",)

    fieldsets = (
        ("Destination", {
            "fields": ("place",),
        }),
        ("Visiting information", {
            "fields": (
                "opening_hours",
                "weekly_holidays",
                "holiday_notes",
                "ticket_price",
                "crowd_guidance",
                "facilities",
            ),
        }),
        ("Verification", {
            "fields": (
                "source_url",
                "last_verified",
            ),
        }),
    )
