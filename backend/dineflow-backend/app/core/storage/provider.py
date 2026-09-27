from abc import ABC, abstractmethod
from typing import Optional
import os

from app.core.config.settings import get_settings

settings = get_settings()


class StorageProvider(ABC):
    @abstractmethod
    async def upload(self, file_data: bytes, filename: str, folder: str = "") -> str:
        pass

    @abstractmethod
    async def delete(self, public_id: str) -> bool:
        pass

    @abstractmethod
    async def get_url(self, public_id: str) -> str:
        pass


class CloudinaryStorage(StorageProvider):
    def __init__(self):
        import cloudinary
        cloudinary.config(
            cloud_name=settings.CLOUDINARY_CLOUD_NAME,
            api_key=settings.CLOUDINARY_API_KEY,
            api_secret=settings.CLOUDINARY_API_SECRET
        )
        self.cloudinary = cloudinary

    async def upload(self, file_data: bytes, filename: str, folder: str = "") -> str:
        # TODO: Implement Cloudinary upload
        return f"https://res.cloudinary.com/demo/image/upload/{folder}/{filename}"

    async def delete(self, public_id: str) -> bool:
        # TODO: Implement Cloudinary delete
        return True

    async def get_url(self, public_id: str) -> str:
        return f"https://res.cloudinary.com/{settings.CLOUDINARY_CLOUD_NAME}/image/upload/{public_id}"


class LocalStorage(StorageProvider):
    def __init__(self, base_path: str = "/tmp/dinely-uploads"):
        self.base_path = base_path
        os.makedirs(base_path, exist_ok=True)

    async def upload(self, file_data: bytes, filename: str, folder: str = "") -> str:
        path = os.path.join(self.base_path, folder, filename)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(file_data)
        return f"file://{path}"

    async def delete(self, public_id: str) -> bool:
        try:
            os.remove(public_id.replace("file://", ""))
            return True
        except OSError:
            return False

    async def get_url(self, public_id: str) -> str:
        return public_id


class S3Storage(StorageProvider):
    def __init__(self):
        import boto3
        self.bucket = settings.AWS_S3_BUCKET
        self.region = settings.AWS_REGION
        self.custom_domain = settings.AWS_S3_CUSTOM_DOMAIN
        self.s3_client = boto3.client("s3", region_name=self.region)

    async def upload(self, file_data: bytes, filename: str, folder: str = "") -> str:
        # Keep clean, tenant-isolated object key (e.g. restaurants/{restaurant_id}/menu/{item_id}/image.webp)
        key = f"{folder.strip('/')}/{filename}" if folder else filename
        
        # Determine content type
        content_type = "application/octet-stream"
        if filename.endswith(".webp"):
            content_type = "image/webp"
        elif filename.endswith(".png"):
            content_type = "image/png"
        elif filename.endswith(".jpg") or filename.endswith(".jpeg"):
            content_type = "image/jpeg"
        elif filename.endswith(".svg"):
            content_type = "image/svg+xml"

        # Boto3 upload (sync run via standard call, lightweight for images)
        self.s3_client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=file_data,
            ContentType=content_type
        )

        if self.custom_domain:
            return f"https://{self.custom_domain}/{key}"
        return f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{key}"

    async def delete(self, public_id: str) -> bool:
        try:
            # Extract key if URL provided
            key = public_id
            if "amazonaws.com/" in public_id:
                key = public_id.split("amazonaws.com/", 1)[1]
            elif self.custom_domain and self.custom_domain in public_id:
                key = public_id.split(f"{self.custom_domain}/", 1)[1]
            self.s3_client.delete_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    async def get_url(self, public_id: str) -> str:
        if public_id.startswith("http://") or public_id.startswith("https://"):
            return public_id
        if self.custom_domain:
            return f"https://{self.custom_domain}/{public_id}"
        return f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{public_id}"


def get_storage_provider() -> StorageProvider:
    if settings.AWS_S3_BUCKET:
        return S3Storage()
    if settings.CLOUDINARY_CLOUD_NAME:
        return CloudinaryStorage()
    return LocalStorage()
