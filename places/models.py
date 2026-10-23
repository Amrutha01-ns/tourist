from django.db import models
class District(models.Model):
    name = models.CharField(max_length=100, unique=True)
    class Meta:
        ordering = ["name"]
    def __str__(self):
        return self.name
class Place(models.Model):
    CATEGORY_CHOICES = [
        ("watery", "Watery"),
        ("religious", "Temples & Religious"),
        ("historical", "Historical"),
        ("nature", "Nature"),
    ]
    district = models.ForeignKey(
        District,
        on_delete=models.CASCADE,
        related_name="places"
    )
    name = models.CharField(max_length=150)
    slug = models.SlugField(
    max_length=170,
    blank=True,
    null=True
)
    category = models.CharField(
        max_length=50,
        choices=CATEGORY_CHOICES,
        db_index=True,
    )
    speciality = models.CharField(max_length=255)
    description = models.TextField()
    image = models.ImageField(upload_to="places/")
    class Meta:
        ordering = ["name"]
        indexes = [
            models.Index(fields=["district", "category"]),
        ]
    def __str__(self):
        return self.name
    def save(self, *args, **kwargs):
        if not self.slug:
            from django.utils.text import slugify
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)
    
class PlaceDetails(models.Model):
    place = models.OneToOneField(
        "places.Place",
        on_delete=models.CASCADE,
        related_name="guide_details",
    )

    opening_hours = models.CharField(
        max_length=255,
        blank=True,
        help_text="Include seasonal variations when applicable.",
    )

    weekly_holidays = models.CharField(
        max_length=255,
        blank=True,
    )

    holiday_notes = models.TextField(blank=True)

    ticket_price = models.TextField(
        blank=True,
        help_text="Record prices by visitor category and applicable conditions.",
    )

    crowd_guidance = models.TextField(blank=True)

    facilities = models.TextField(
        blank=True,
        help_text="Facilities available at or near the destination.",
    )

    source_url = models.URLField(
        max_length=500,
        blank=True,
        help_text="Official or otherwise authoritative source for the information.",
    )

    last_verified = models.DateField(
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["place__name"]
        verbose_name = "Place guide"
        verbose_name_plural = "Place guides"

    def __str__(self):
        return f"Guide: {self.place.name}"

    @property
    def is_verified(self):
        return bool(self.source_url and self.last_verified)
