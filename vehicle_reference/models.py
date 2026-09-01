from django.db import models
class ServiceProvider(models.Model):
    name = models.CharField(max_length=100)
    service_type = models.CharField(max_length=50)
    def __str__(self):
        return self.name
class VehicleClass(models.Model):
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    def __str__(self):
        return self.name
