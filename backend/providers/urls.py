from django.urls import path, include
from rest_framework.routers import DefaultRouter
from providers.views import (
    ProviderViewSet,
    ProviderMeView,
    ServiceViewSet,
    WorkingHoursViewSet,
    TimeOffViewSet,
)

router = DefaultRouter()
router.register('providers', ProviderViewSet, basename='providers')
router.register('services', ServiceViewSet, basename='services')
router.register('working-hours', WorkingHoursViewSet, basename='working-hours')
router.register('time-off', TimeOffViewSet, basename='time-off')

urlpatterns = [
    path('providers/me/', ProviderMeView.as_view(), name='provider-me'),
    path('', include(router.urls)),
]
