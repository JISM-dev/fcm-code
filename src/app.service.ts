import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import * as admin from 'firebase-admin';

export type NotificationDataPayload = {
  token?: string;
  title?: string;
  body?: string;
  type?: string;
  itemId?: string;
};

const normalizeNonBlankString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  async sendNotification(payload: NotificationDataPayload): Promise<void> {
    const token = normalizeNonBlankString(payload.token);
    const title = normalizeNonBlankString(payload.title);
    const body = normalizeNonBlankString(payload.body);
    const type = normalizeNonBlankString(payload.type);
    const itemId = normalizeNonBlankString(payload.itemId);

    if (!token || !title || !body) {
      throw new BadRequestException('token, title, body are required.');
    }

    const data: Record<string, string> = {
      title,
      body,
    };
    if (type) {
      data.type = type;
    }
    if (itemId) {
      data.itemId = itemId;
    }

    const message: admin.messaging.Message = {
      token,
      notification: {
        title,
        body,
      },
      data,
      android: {
        priority: 'high',
      },
      apns: {
        payload: {
          aps: {
            alert: {
              title,
              body,
            },
            sound: 'default',
            contentAvailable: true,
          },
        },
      },
    };

    try {
      await admin.messaging().send(message);
    } catch (error) {
      console.error('Error sending message:', error);
      throw new InternalServerErrorException('Failed to send notification.');
    }
  }
}
