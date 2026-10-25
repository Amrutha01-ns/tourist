"""
Add more tourist places to the existing districts.

    python manage.py seed_more_places --dry-run   # see what would happen
    python manage.py seed_more_places             # add them

Safe to run many times: a place that already exists (same name, any district)
is skipped. Districts are matched case-insensitively against the aliases below,
so "Mysore" / "Mysuru" or "Madikeri" / "Kodagu" will reuse YOUR existing rows
instead of creating duplicates.

Images: put a file named exactly like the slug (e.g. jog-falls.jpg / .webp /
.avif / .png) inside config/media/places/ and re-run; the command attaches it.
Places without an image still work (the site shows "No Image Available").

Opening hours / ticket prices are deliberately NOT filled in - add verified
values in the admin (Place guides) so nothing unverified is shown to visitors.
"""
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.text import slugify

from places.models import District, Place

W, R, H, N = "watery", "religious", "historical", "nature"

# (primary district name, [aliases], [ (name, category, speciality, description) ])
SEED = [
    ("Mysore", ["Mysore", "Mysuru"], [
        ("Mysore Zoo", N, "One of India's oldest and best-kept zoos",
         "Officially the Sri Chamarajendra Zoological Gardens, this heritage zoo is spread over shaded, landscaped grounds and is easy to combine with a Mysuru city day."),
        ("Jaganmohan Palace", H, "Royal palace turned art gallery",
         "Built for the Wadiyar rulers, the palace now houses the Sri Jayachamarajendra Art Gallery with paintings, artefacts and royal memorabilia."),
        ("St. Philomena's Church", R, "Neo-Gothic cathedral with twin spires",
         "One of the largest churches in the region, known for its tall twin spires, stained glass and a peaceful crypt."),
        ("Karanji Lake", W, "Lakeside nature park and butterfly garden",
         "A calm lake beside Chamundi Hill with a walk-through aviary and butterfly park, popular for relaxed evening visits."),
        ("Somanathapura Chennakesava Temple", R, "Finely carved Hoysala temple",
         "A star-shaped Hoysala temple covered in detailed sculpture, a short drive from Mysuru and a favourite with history lovers."),
        ("Namdroling Monastery (Golden Temple)", R, "Tibetan Buddhist monastery at Bylakuppe",
         "A large Tibetan settlement with a golden-hued monastery, colourful murals and monks in daily prayer."),
    ]),
    ("Madikeri", ["Madikeri", "Kodagu", "Coorg"], [
        ("Iruppu Falls", W, "Sacred waterfall in the Brahmagiri hills",
         "A forest waterfall near Srimangala, linked to the Rameshwara temple on its bank and best seen in and just after the monsoon."),
        ("Mandalpatti Viewpoint", N, "Misty hilltop viewpoint above the clouds",
         "A scenic peak in the Pushpagiri range reached by a rough jeep track, loved for sunrise views over rolling green hills."),
        ("Tadiandamol Peak", N, "Highest peak in Kodagu",
         "A rewarding trek through grassland and shola forest with wide views across the Western Ghats."),
        ("Chelavara Falls", W, "Waterfall amid coffee and cardamom hills",
         "A beautiful cascade near Cheyyandane, best visited in the rainy season and often paired with a trip to nearby viewpoints."),
        ("Mallalli Falls", W, "Powerful falls in the Pushpagiri foothills",
         "A tall waterfall near Somwarpet reached by a short walk through plantations, at its best after good rain."),
    ]),
    ("Chikkamagaluru", ["Chikkamagaluru", "Chikmagalur", "Chikkamagalur"], [
        ("Baba Budangiri", N, "Rolling hills and a revered shrine",
         "A hill range associated with the early coffee story of India, with cave shrines, grassy slopes and sweeping views."),
        ("Kemmanagundi", N, "Hill station with rose garden and sunset views",
         "A quiet hill station in the Baba Budan range, known for its gardens, viewpoints and nearby waterfalls."),
        ("Hebbe Falls", W, "Two-stage waterfall in dense forest",
         "A scenic fall near Kemmanagundi, usually reached by a jeep ride followed by a walk through coffee estates."),
        ("Sringeri Sharadamba Temple", R, "Historic seat of learning on the Tunga river",
         "A major pilgrimage town with the Sharada Peetha, riverside ghats and temple architecture."),
        ("Kudremukh National Park", N, "Shola grasslands and Western Ghats forest",
         "A protected highland area famous for its horse-face shaped peak, rich biodiversity and trekking routes (permissions required)."),
        ("Kalhatti Falls", W, "Waterfall near Kemmanagundi",
         "A seasonal waterfall reached by a short walk, often visited together with the Kalhathigiri temple."),
    ]),
    ("Hampi", ["Hampi", "Vijayanagara", "Ballari", "Bellary"], [
        ("Virupaksha Temple", R, "Living temple in the heart of Hampi",
         "A 7th-century-origin temple still in daily worship, with a towering gopuram facing the busy Hampi Bazaar."),
        ("Vittala Temple", H, "Home of the famous Stone Chariot",
         "A UNESCO World Heritage monument known for its musical pillars, sculpted halls and the iconic stone chariot."),
        ("Lotus Mahal", H, "Elegant Indo-Islamic pavilion",
         "A symmetrical, lotus-shaped pavilion inside the Zenana Enclosure, notable for its arched openings."),
        ("Elephant Stables", H, "Domed royal stables",
         "A long row of domed chambers that once housed the royal elephants, showing a blend of architectural styles."),
        ("Matanga Hill", N, "Best sunrise viewpoint in Hampi",
         "A short but steep climb to a rocky summit with panoramic views over the ruins, the river and the banana fields."),
        ("Tungabhadra Dam", W, "Large reservoir with a landscaped garden",
         "A major dam near Hosapete with a garden, viewpoints and a pleasant evening atmosphere."),
        ("Sanapur Lake", W, "Quiet lake with coracle rides",
         "A calm reservoir surrounded by boulder hills near Hampi, popular for coracle rides and sunsets."),
    ]),
    ("Udupi", ["Udupi"], [
        ("Sri Krishna Temple", R, "Famous temple with the Kanakana Kindi window",
         "A renowned 13th-century temple where Lord Krishna is worshipped through a silver-plated window, known for its Udupi cuisine tradition."),
        ("Malpe Beach", W, "Wide beach with water sports",
         "A clean, lively beach with watersports, seafood stalls and boats to St. Mary's Island."),
        ("St. Mary's Island", W, "Island of unusual hexagonal basalt columns",
         "A small island off Malpe with striking columnar rock formations, reached by a short ferry (seasonal)."),
        ("Kaup Beach and Lighthouse", W, "Beach with a historic lighthouse",
         "A beautiful stretch of coast with a red-and-white lighthouse that you can climb for sea views."),
        ("Kollur Mookambika Temple", R, "Pilgrimage site at the foot of the Western Ghats",
         "A well-known Shakti temple located near the Souparnika river, surrounded by forested hills."),
        ("Maravanthe Beach", W, "Road squeezed between sea and river",
         "A scenic highway stretch with the Arabian Sea on one side and the Souparnika river on the other."),
    ]),
    ("Mangaluru", ["Mangaluru", "Mangalore", "Dakshina Kannada"], [
        ("Panambur Beach", W, "Popular city beach with sunset views",
         "A well-kept beach near the port, known for camel and boat rides, parasailing and evening crowds."),
        ("Tannirbhavi Beach", W, "Quieter beach with a tree park",
         "A calm beach at the Netravathi estuary with a nearby tree park, ideal for a relaxed evening."),
        ("Kadri Manjunath Temple", R, "Ancient temple with bronze sculptures",
         "A hillside temple dating back many centuries, noted for its bronze images and spring-fed ponds."),
        ("Sultan Battery", H, "Watchtower built by Tipu Sultan",
         "A black-stone watchtower overlooking the Gurupura river, built to guard the river mouth."),
        ("Pilikula Nisargadhama", N, "Biological park with a lake and heritage village",
         "A multi-attraction park with a zoo, botanical garden, boating and a museum-style heritage village."),
        ("St. Aloysius Chapel", R, "Chapel covered in Italian-style paintings",
         "A heritage chapel whose walls and ceiling are covered in colourful paintings by an Italian Jesuit artist."),
        ("Mangaladevi Temple", R, "Temple that gave the city its name",
         "A centuries-old temple dedicated to Goddess Mangaladevi in the heart of Mangaluru."),
    ]),
    ("Shivamogga", ["Shivamogga", "Shimoga"], [
        ("Jog Falls", W, "One of India's highest plunge waterfalls",
         "The Sharavathi river drops in four distinct streams; the view is most dramatic from July to October."),
        ("Agumbe", N, "Rainforest village known for sunsets",
         "A misty Western Ghats village famous for its sunset point, rainforest research station and wildlife."),
        ("Kodachadri", N, "Forested peak with a shrine and treks",
         "A scenic hill near Kollur with trekking trails, a hilltop shrine and views over the Western Ghats."),
        ("Keladi Rameshwara Temple", H, "Historic Keladi Nayaka-era temple",
         "A temple complex from the Keladi Nayaka dynasty combining Hoysala and Dravidian influences."),
        ("Sakrebailu Elephant Camp", N, "Elephant camp on the Tunga river",
         "A forest-department camp where elephants are bathed and fed beside the river, best seen in the morning."),
        ("Lion and Tiger Safari, Tyavarekoppa", N, "Safari park near Shivamogga",
         "A safari park offering bus rides through lion and tiger enclosures."),
        ("Honnemaradu", W, "Backwater island in the Sharavathi reservoir",
         "A scenic reservoir area known for water sports, camping and kayaking."),
    ]),
    ("Gokarna", ["Gokarna", "Uttara Kannada"], [
        ("Mahabaleshwar Temple, Gokarna", R, "Ancient temple housing the Atmalinga",
         "A major pilgrimage temple by the sea, known for its Dravidian style and its Shivaratri festival."),
        ("Om Beach", W, "Beach shaped like the 'Om' symbol",
         "Two curved bays that together form the Om shape, with calm water, cafes and watersports."),
        ("Kudle Beach", W, "Long, relaxed beach with shacks",
         "A wide beach popular with backpackers, with a laid-back vibe, sunsets and beach shacks."),
        ("Murudeshwar Temple", R, "Giant Shiva statue by the sea",
         "A coastal temple with one of the world's tallest Shiva statues and a towering gopuram."),
        ("Yana Caves", N, "Black limestone rock pillars in the forest",
         "Two giant crystalline limestone formations in dense forest, reached by a short trek."),
        ("Magod Falls", W, "Waterfall that splits into two streams",
         "A scenic cascade where the Bedti river falls from a great height into a valley, best after the monsoon."),
    ]),
    ("Hassan", ["Hassan"], [
        ("Shravanabelagola", R, "Colossal monolithic statue of Gommateshwara",
         "A major Jain pilgrimage site where a monolithic statue stands atop Vindhyagiri hill, reached by a climb of many steps."),
        ("Manjarabad Fort", H, "Star-shaped fort built by Tipu Sultan",
         "An 18th-century star-shaped fort near Sakleshpur with views of the surrounding hills."),
        ("Doddagaddavalli Lakshmi Devi Temple", R, "Early Hoysala temple",
         "A beautiful early Hoysala temple known for its unusual four-shrine design."),
    ]),
    ("Mandya", ["Mandya"], [
        ("Ranganathittu Bird Sanctuary", N, "Riverside bird sanctuary with boat rides",
         "A bird sanctuary on small islands in the Kaveri where visitors can see crocodiles and migratory and resident birds on a boat tour."),
        ("Sri Ranganathaswamy Temple, Srirangapatna", R, "Island temple on the Kaveri",
         "A temple on the Srirangapatna island dedicated to Lord Ranganatha, built in Hoysala and Vijayanagara styles."),
        ("Dariya Daulat Bagh", H, "Tipu Sultan's summer palace",
         "A beautiful Indo-Islamic palace set in a garden, decorated with murals depicting battles and court scenes."),
        ("Gumbaz, Srirangapatna", H, "Mausoleum of Tipu Sultan and Hyder Ali",
         "A domed mausoleum with ornate doors and black marble pillars."),
        ("Shivanasamudra Falls", W, "Twin falls: Gaganachukki and Bharachukki",
         "Two spectacular falls of the Kaveri, seen best after the monsoon."),
        ("Melukote", R, "Hill temple town with a Yoga Narasimha shrine",
         "A hill town with the Cheluvanarayana Swamy temple, a Yoga Narasimha shrine and traditional Vaishnava culture."),
    ]),
]

IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".avif")


class Command(BaseCommand):
    help = "Add more places to the existing districts (safe to re-run)."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true",
                            help="Show what would be added without saving.")

    def find_district(self, aliases):
        for alias in aliases:
            d = District.objects.filter(name__iexact=alias).first()
            if d:
                return d
        return None

    def find_image(self, slug):
        media_dir = settings.MEDIA_ROOT / "places"
        for ext in IMAGE_EXTS:
            if (media_dir / f"{slug}{ext}").exists():
                return f"places/{slug}{ext}"
        return ""

    @transaction.atomic
    def handle(self, *args, **opts):
        dry = opts["dry_run"]
        added = skipped = with_img = 0
        missing_images = []

        for primary, aliases, items in SEED:
            district = self.find_district(aliases)
            if district is None:
                self.stdout.write(self.style.WARNING(f"+ new district: {primary}"))
                if not dry:
                    district = District.objects.create(name=primary)
            else:
                self.stdout.write(f"District: {district.name}")

            for name, category, speciality, description in items:
                existing = Place.objects.filter(name__iexact=name).first()
                if existing:
                    skipped += 1
                    note = ""
                    # attach a photo you added later, without touching other fields
                    if not existing.image and existing.slug:
                        img = self.find_image(existing.slug)
                        if img:
                            note = "  [image attached]"
                            if not dry:
                                existing.image = img
                                existing.save(update_fields=["image"])
                    self.stdout.write(f"   = exists   {name}{note}")
                    continue

                slug = slugify(name)
                # keep slugs unique (the detail URL uses the slug)
                base, n = slug, 2
                while Place.objects.filter(slug=slug).exists():
                    slug = f"{base}-{n}"
                    n += 1

                image = self.find_image(slug)
                if image:
                    with_img += 1
                else:
                    missing_images.append(slug)

                self.stdout.write(self.style.SUCCESS(f"   + add      {name}") +
                                  ("  [image]" if image else ""))
                if not dry:
                    Place.objects.create(
                        district=district, name=name, slug=slug, category=category,
                        speciality=speciality[:255], description=description,
                        image=image,
                    )
                added += 1

        verb = "Would add" if dry else "Added"
        self.stdout.write(self.style.SUCCESS(
            f"\n{verb} {added} places ({skipped} already existed, {with_img} with images)."))
        if missing_images:
            self.stdout.write(
                "\nTo give places a photo, save images in config/media/places/ named:\n  " +
                "\n  ".join(f"{s}.jpg" for s in missing_images[:10]) +
                (f"\n  ... and {len(missing_images) - 10} more (any of .jpg .png .webp .avif)"
                 if len(missing_images) > 10 else "") +
                "\nthen run the command again (existing places get their image attached)."
            )
