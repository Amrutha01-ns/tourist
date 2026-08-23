from django.db import models
class District(models.Model):
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name
class Place(models.Model):
    district = models.ForeignKey(
        District,
        on_delete=models.CASCADE,
        related_name="places"
    )
    name = models.CharField(max_length=150)
    speciality = models.CharField(max_length=255)
    description = models.TextField()
    image = models.ImageField(upload_to="places/")
    def __str__(self):
        return self.name
 