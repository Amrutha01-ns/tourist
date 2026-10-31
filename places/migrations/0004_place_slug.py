from django.db import migrations, models
from django.utils.text import slugify


def generate_slugs(apps, schema_editor):
    Place = apps.get_model("places", "Place")

    for place in Place.objects.all():
        base_slug = slugify(place.name)
        slug = base_slug
        counter = 2

        while Place.objects.filter(slug=slug).exclude(pk=place.pk).exists():
            slug = f"{base_slug}-{counter}"
            counter += 1

        place.slug = slug
        place.save(update_fields=["slug"])


class Migration(migrations.Migration):

    dependencies = [
        ("places", "0003_alter_district_options_alter_place_options_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="place",
            name="slug",
            field=models.CharField(
                blank=True,
                max_length=170,
                null=True,
            ),
        ),

        migrations.RunPython(
            generate_slugs,
            migrations.RunPython.noop,
        ),

        migrations.AlterField(
            model_name="place",
            name="slug",
            field=models.SlugField(
                blank=True,
                max_length=170,
                unique=True,
            ),
        ),
    ]
