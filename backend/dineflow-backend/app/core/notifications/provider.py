from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
from enum import Enum


class NotificationChannel(Enum):
    EMAIL = "email"
    SMS = "sms"
    WHATSAPP = "whatsapp"
    PUSH = "push"
    WEBSOCKET = "websocket"
    IN_APP = "in_app"


class NotificationProvider(ABC):
    @abstractmethod
    async def send(
        self,
        recipient: str,
        subject: str,
        content: str,
        template_key: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None
    ) -> bool:
        pass


class EmailProvider(NotificationProvider):
    async def send(self, recipient, subject, content, template_key=None, payload=None):
        # TODO: Implement SendGrid integration
        print(f"[EMAIL] To: {recipient}, Subject: {subject}")
        return True


class SMSProvider(NotificationProvider):
    async def send(self, recipient, subject, content, template_key=None, payload=None):
        # TODO: Implement Twilio integration
        print(f"[SMS] To: {recipient}, Content: {content}")
        return True


class NotificationService:
    def __init__(self):
        self.providers = {
            NotificationChannel.EMAIL: EmailProvider(),
            NotificationChannel.SMS: SMSProvider()
        }

    async def send_notification(
        self,
        channel: NotificationChannel,
        recipient: str,
        subject: str,
        content: str,
        **kwargs
    ) -> bool:
        provider = self.providers.get(channel)
        if not provider:
            return False
        return await provider.send(recipient, subject, content, **kwargs)


notification_service = NotificationService()
