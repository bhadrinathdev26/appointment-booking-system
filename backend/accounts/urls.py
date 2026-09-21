from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from accounts.views import (
    RegisterView,
    CustomTokenObtainPairView,
    CurrentUserView,
    AdminUserViewSet,
    AdminCreateProviderView,
)

router = DefaultRouter()
router.register('users', AdminUserViewSet, basename='users')

urlpatterns = [
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('login/', CustomTokenObtainPairView.as_view(), name='auth-login'),
    path('refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('me/', CurrentUserView.as_view(), name='auth-me'),
    path('admin/providers/', AdminCreateProviderView.as_view(), name='admin-create-provider'),
]
