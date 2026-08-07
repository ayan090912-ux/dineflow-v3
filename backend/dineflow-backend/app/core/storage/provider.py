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
    def __init__(self, base_path: str = "/tmp/dineflow-uploads"):
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


def get_storage_provider() -> StorageProvider:
    if settings.CLOUDINARY_CLOUD_NAME:
        return CloudinaryStorage()
    return LocalStorage()
