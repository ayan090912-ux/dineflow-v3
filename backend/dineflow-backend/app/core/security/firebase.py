import os
import json
import logging
from typing import Dict, Any, Optional

from app.core.config.settings import get_settings

logger = logging.getLogger("dinely.security.firebase")

settings = get_settings()
_firebase_admin_initialized = False

try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth_admin, credentials

    if not firebase_admin._apps:
        if settings.FIREBASE_SERVICE_ACCOUNT_KEY_PATH and os.path.exists(settings.FIREBASE_SERVICE_ACCOUNT_KEY_PATH):
            cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_KEY_PATH)
            firebase_admin.initialize_app(cred, {"projectId": settings.FIREBASE_PROJECT_ID})
            _firebase_admin_initialized = True
            logger.info("Firebase Admin SDK initialized using service account key file.")
        else:
            try:
                # Initialize default app (useful in Google Cloud / Firebase Hosting environments)
                firebase_admin.initialize_app(options={"projectId": settings.FIREBASE_PROJECT_ID})
                _firebase_admin_initialized = True
                logger.info("Firebase Admin SDK initialized with default app options.")
            except Exception as e:
                logger.warning(f"Firebase Admin SDK default initialization skipped: {e}")
except ImportError:
    logger.warning("firebase-admin package not installed. Using fallback verification.")


import time
import urllib.request
from jose import jwt
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization

_google_certs_cache: Dict[str, str] = {}
_google_certs_cache_expiry: float = 0.0


def get_google_public_key_pem(kid: str) -> Optional[str]:
    global _google_certs_cache, _google_certs_cache_expiry
    now = time.time()
    if not _google_certs_cache or now >= _google_certs_cache_expiry:
        try:
            url = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"
            req = urllib.request.Request(url, headers={"User-Agent": "Dinely-Cloud/3.0"})
            with urllib.request.urlopen(req, timeout=5) as resp:
                _google_certs_cache = json.loads(resp.read().decode("utf-8"))
                _google_certs_cache_expiry = now + 3600
        except Exception as e:
            logger.warning(f"Failed to fetch Google public certs: {e}")
            if not _google_certs_cache:
                return None

    cert_str = _google_certs_cache.get(kid)
    if not cert_str:
        return None

    try:
        cert_obj = x509.load_pem_x509_certificate(cert_str.encode("utf-8"), default_backend())
        pub_pem = cert_obj.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode("utf-8")
        return pub_pem
    except Exception as e:
        logger.warning(f"Failed to extract public key for kid {kid}: {e}")
        return None


def verify_google_firebase_id_token_cryptographic(id_token: str, project_id: str) -> Dict[str, Any]:
    header = jwt.get_unverified_header(id_token)
    kid = header.get("kid")
    if not kid:
        raise ValueError("Firebase ID token missing 'kid' in header")

    pub_key_pem = get_google_public_key_pem(kid)
    if not pub_key_pem:
        raise ValueError(f"Unknown or expired Google public key ID: {kid}")

    expected_issuer = f"https://securetoken.google.com/{project_id}"
    claims = jwt.decode(
        id_token,
        pub_key_pem,
        algorithms=["RS256"],
        audience=project_id,
        issuer=expected_issuer,
        options={
            "verify_signature": True,
            "verify_aud": True,
            "verify_iat": True,
            "verify_exp": True,
            "verify_iss": True,
        }
    )

    uid = claims.get("user_id") or claims.get("sub") or claims.get("uid")
    if uid:
        claims["uid"] = uid
        claims["user_id"] = uid
    if claims.get("email"):
        claims["email"] = claims["email"].lower()

    return claims


def verify_firebase_id_token(id_token: str) -> Dict[str, Any]:
    """
    Verifies a Firebase ID token using:
    1. Official Firebase Admin SDK if service account is configured.
    2. Official Google Public X.509 Cryptographic Verification (RS256) directly against Google auth servers.
    3. Fallback dev/test parser strictly restricted to non-production/test environments.
    """
    is_prod = (settings.ENVIRONMENT or "").strip().lower() == "production"

    if not id_token or not isinstance(id_token, str):
        raise ValueError("Firebase ID token is required")

    import sys
    is_test_env = (
        "pytest" in sys.modules or
        os.environ.get("PYTEST_CURRENT_TEST") is not None or
        (settings.ENVIRONMENT or "").strip().lower() in ("test", "testing")
    )

    # Real cryptographically signed Google token verification
    if id_token.startswith("ey"):
        # 1. Attempt official Firebase Admin SDK if initialized
        if _firebase_admin_initialized:
            try:
                decoded = firebase_auth_admin.verify_id_token(id_token, check_revoked=False)
                return decoded
            except Exception as err:
                logger.info(f"Firebase Admin SDK verification deferred ({err}); attempting cryptographic public key verification...")

        # 2. Direct cryptographic verification against Google's public x509 certs
        try:
            return verify_google_firebase_id_token_cryptographic(id_token, settings.FIREBASE_PROJECT_ID)
        except Exception as crypt_err:
            if is_prod or not is_test_env:
                logger.warning(f"Google cryptographic token verification failed: {crypt_err}")
                raise ValueError(f"Invalid or expired authentication token: {str(crypt_err)}")
            logger.debug(f"Cryptographic check failed for test token ({crypt_err}), falling back to test parser.")

    if is_prod:
        raise ValueError("Synthetic tokens are prohibited in production environment")

    if _firebase_admin_initialized and id_token.startswith("ey") and not is_test_env:
        try:
            decoded = firebase_auth_admin.verify_id_token(id_token, check_revoked=False)
            return decoded
        except Exception as err:
            logger.warning(f"Firebase Admin SDK token verification failed: {err}. Falling back for non-prod.")

    # 2. Development / Fallback token parsing for unit testing & local dev ONLY
    if not id_token or not isinstance(id_token, str):
        raise ValueError("Invalid Firebase ID token format")

    parts = id_token.split(".")
    if len(parts) == 3:
        try:
            import base64
            payload_b64 = parts[1]
            # Handle padding
            payload_b64 += "=" * ((4 - len(payload_b64) % 4) % 4)
            payload_json = base64.urlsafe_b64decode(payload_b64).decode("utf-8")
            claims = json.loads(payload_json)

            # Standardize claim fields
            uid = claims.get("user_id") or claims.get("sub") or claims.get("uid")
            email = claims.get("email")
            if uid:
                claims["uid"] = uid
                claims["user_id"] = uid
            if email:
                claims["email"] = email.lower()
            return claims
        except Exception as e:
            logger.warning(f"Fallback JWT parse failed: {e}")

    # 3. Development synthetic token handling
    if id_token.startswith("firebase_token_"):
        token_body = id_token[len("firebase_token_"):]
        if "::" in token_body:
            parts = token_body.split("::")
            token_role_type = parts[0].lower()
            uid = parts[1] if len(parts) > 1 else "uid_dev"
            email = parts[2] if len(parts) > 2 else (settings.PLATFORM_ADMIN_EMAIL or "user@dinely.com")
        elif "__" in token_body:
            parts = token_body.split("__")
            token_role_type = parts[0].lower()
            uid = parts[1] if len(parts) > 1 else "uid_dev"
            email = parts[2] if len(parts) > 2 else (settings.PLATFORM_ADMIN_EMAIL or "user@dinely.com")
        elif "_" in token_body:
            parts = token_body.split("_")
            token_role_type = parts[0].lower()
            if len(parts) == 2:
                uid = parts[1]
                email = parts[1] if "@" in parts[1] else (settings.PLATFORM_ADMIN_EMAIL or "user@dinely.com")
            elif len(parts) == 3:
                uid = parts[1]
                email = parts[2]
            else:
                uid = parts[1]
                email = "_".join(parts[2:])
        else:
            token_role_type = token_body.lower()
            uid = "uid_dev"
            email = settings.PLATFORM_ADMIN_EMAIL or "user@dinely.com"

        is_admin_token = token_role_type in ["admin", "platform_admin"]
        assigned_role = "PLATFORM_ADMIN" if is_admin_token else ("RESTAURANT_OWNER" if token_role_type in ["owner", "restaurant_owner"] else token_role_type.upper())

        return {
            "uid": uid,
            "user_id": uid,
            "sub": uid,
            "email": email.lower(),
            "email_verified": True,
            "role": assigned_role,
            "admin": is_admin_token,
            "firebase": {"sign_in_provider": "google.com"}
        }

    raise ValueError("Firebase Admin SDK uninitialized and token format invalid")


def set_platform_admin_custom_claims(uid: str) -> Dict[str, Any]:
    """
    Assigns custom claims { "admin": True, "role": "PLATFORM_ADMIN" }
    to a verified Firebase UID using Firebase Admin SDK.
    """
    claims = {
        "admin": True,
        "role": "PLATFORM_ADMIN"
    }

    if _firebase_admin_initialized:
        try:
            firebase_auth_admin.set_custom_user_claims(uid, claims)
            logger.info(f"Successfully set custom admin claims for Firebase UID: {uid}")
        except Exception as e:
            logger.error(f"Failed to set custom user claims for UID {uid}: {e}")
            raise RuntimeError(f"Failed to assign Platform Admin claims via Firebase Admin SDK: {e}")
    else:
        if (settings.ENVIRONMENT or "").strip().lower() == "production":
            raise RuntimeError("Cannot assign custom claims: Firebase Admin SDK is uninitialized in production")
        logger.info(f"Mocked custom admin claim assignment for UID: {uid}")

    return claims
