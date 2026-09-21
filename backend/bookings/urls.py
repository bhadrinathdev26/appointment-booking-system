from django.urls import path, include
from rest_framework.routers import DefaultRouter
from bookings.views import BookingViewSet, DashboardStatsView

router = DefaultRouter()
router.register(r'bookings', BookingViewSet, basename='booking')

urlpatterns = [
    path('dashboard/stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('', include(router.urls)),
]
