from django.contrib import admin
from django.urls import path, include
from core.views import health_check
from accounts.urls import router as accounts_router

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health_check, name='health-check'),
    path('api/auth/', include('accounts.urls')),
    path('api/', include(accounts_router.urls)),
    path('api/', include('providers.urls')),
    path('api/', include('bookings.urls')),
]
