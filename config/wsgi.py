"""
WSGI config for config project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.1/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_wsgi_application()

try:
    from whitenoise import WhiteNoise
    from django.conf import settings
    if hasattr(settings, 'MEDIA_ROOT') and settings.MEDIA_ROOT.exists():
        application = WhiteNoise(application)
        application.add_files(str(settings.MEDIA_ROOT), prefix=settings.MEDIA_URL)
except Exception:
    pass
