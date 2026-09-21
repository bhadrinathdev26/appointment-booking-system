from rest_framework.permissions import BasePermission


class IsCustomerRole(BasePermission):
    """Allows access only to authenticated users with the 'customer' role."""

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'customer'
        )


class IsProviderRole(BasePermission):
    """Allows access only to authenticated users with the 'provider' role."""

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'provider'
        )


class IsAdminRole(BasePermission):
    """Allows access only to authenticated users with the 'admin' role."""

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'admin'
        )


class IsProviderOrAdmin(BasePermission):
    """Allows access to either providers or platform administrators."""

    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in ('provider', 'admin')
        )
