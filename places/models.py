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
    category = models.CharField(
        max_length=50,
        choices=CATEGORY_CHOICES,
        db_index=True,   # speeds up category filtering
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