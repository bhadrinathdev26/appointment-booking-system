from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth.password_validation import validate_password
from django.conf import settings
from django.utils import timezone
from providers.models import ProviderProfile

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """Standard representation of user account."""

    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'username',
            'first_name',
            'last_name',
            'role',
            'phone',
            'is_active',
            'date_joined',
        ]
        read_only_fields = ['id', 'role', 'is_active', 'date_joined']


class RegisterSerializer(serializers.ModelSerializer):
    """Public customer registration serializer. Strictly enforces role='customer'."""

    password = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'},
        validators=[validate_password]
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )

    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'username',
            'first_name',
            'last_name',
            'phone',
            'password',
            'password_confirm',
        ]

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise ValidationError({"password_confirm": "Passwords do not match."})
        attrs['email'] = attrs['email'].lower()
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm', None)
        # Always enforce role='customer' regardless of any request payload
        validated_data['role'] = User.ROLE_CUSTOMER

        user = User.objects.create_user(
            email=validated_data['email'].lower(),
            username=validated_data['username'],
            password=validated_data['password'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            phone=validated_data.get('phone', ''),
            role=User.ROLE_CUSTOMER,
        )
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    """
    Explicit email-based login serializer with lowercase normalization
    and embedded role metadata.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Support email as the primary login credential
        self.fields['email'] = serializers.EmailField()
        if 'username' in self.fields:
            self.fields['username'].required = False

    def validate(self, attrs):
        email = attrs.get('email', '').strip().lower()
        password = attrs.get('password', '')

        if not email or not password:
            raise ValidationError({"detail": "Both email and password are required."})

        try:
            user_obj = User.objects.get(email=email)
        except User.DoesNotExist:
            raise ValidationError({"detail": "No active account found with the given credentials."})

        if not user_obj.check_password(password):
            raise ValidationError({"detail": "No active account found with the given credentials."})

        if not user_obj.is_active:
            raise ValidationError({"detail": "This user account has been deactivated."})

        self.user = user_obj

        # Generate SimpleJWT tokens
        refresh = self.get_token(self.user)
        data = {
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': {
                'id': self.user.id,
                'email': self.user.email,
                'username': self.user.username,
                'role': self.user.role,
                'first_name': self.user.first_name,
                'last_name': self.user.last_name,
                'phone': self.user.phone,
            }
        }
        return data

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['email'] = user.email
        token['username'] = user.username
        return token


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    """
    Admin user management serializer.
    Only allows toggling is_active and switching role between customer and admin.
    """

    class Meta:
        model = User
        fields = [
            'id',
            'email',
            'username',
            'first_name',
            'last_name',
            'role',
            'phone',
            'is_active',
            'date_joined',
        ]
        read_only_fields = ['id', 'email', 'username', 'date_joined']

    def validate(self, attrs):
        instance = self.instance
        request = self.context.get('request')
        new_role = attrs.get('role')
        new_active = attrs.get('is_active')

        # Demo mode protection
        if getattr(settings, 'DEMO_MODE', False):
            demo_usernames = ['admin', 'clinic_dr_sharma', 'salon_style_studio', 'tutor_math_ace', 'customer_rahul', 'customer_priya']
            if instance.username in demo_usernames and (new_active is False or (new_role and new_role != instance.role)):
                raise ValidationError("Seeded demo accounts cannot be deactivated or demoted while demo mode is active.")

        # Self-deactivation protection
        if request and instance == request.user and new_active is False:
            raise ValidationError({"is_active": "Administrators cannot deactivate their own account."})

        # Last active admin protection
        if instance.role == User.ROLE_ADMIN:
            if new_active is False or (new_role and new_role != User.ROLE_ADMIN):
                active_admins = User.objects.filter(role=User.ROLE_ADMIN, is_active=True).count()
                if active_admins <= 1:
                    raise ValidationError({"role": "Cannot deactivate or demote the last remaining active administrator."})

        # Provider role immutability rule (B.14)
        if instance.role == User.ROLE_PROVIDER and new_role and new_role != User.ROLE_PROVIDER:
            raise ValidationError({"role": "Provider roles cannot be changed. Deactivate the provider instead."})

        # Switching to provider is disallowed through this endpoint
        if new_role == User.ROLE_PROVIDER and instance.role != User.ROLE_PROVIDER:
            raise ValidationError({"role": "Provider accounts must be created through POST /api/admin/providers/."})

        return attrs


class AdminCreateProviderSerializer(serializers.Serializer):
    """Admin endpoint to create a provider user and profile in one atomic operation."""

    # User fields
    email = serializers.EmailField()
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, validators=[validate_password])
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)

    # ProviderProfile fields
    business_name = serializers.CharField(max_length=200)
    category = serializers.ChoiceField(choices=ProviderProfile.CATEGORY_CHOICES, default=ProviderProfile.CATEGORY_OTHER)
    description = serializers.CharField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    slot_interval_minutes = serializers.ChoiceField(choices=ProviderProfile.SLOT_INTERVAL_CHOICES, default=30)

    def validate_email(self, value):
        norm_email = value.lower()
        if User.objects.filter(email=norm_email).exists():
            raise ValidationError("A user with this email address already exists.")
        return norm_email

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise ValidationError("A user with this username already exists.")
        return value
