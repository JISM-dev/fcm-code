import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as admin from 'firebase-admin';
import type {
  EnqueueBatchNotificationResult,
  NotificationBatchPayload,
  NotificationBatchQueueItem,
  NotificationDataPayload,
} from './notification.types';

// FCM 멀티캐스트 API는 한 번에 최대 500개 토큰만 보낼 수 있습니다.
const MULTICAST_CHUNK_SIZE = 500;
// 메모리 큐에 쌓아둘 수 있는 최대 배치 작업 개수입니다.
const MAX_BATCH_QUEUE_SIZE = 1000;
// 한 번의 비동기 요청에서 허용하는 최대 토큰 수입니다.
const MAX_BATCH_TOKENS_PER_REQUEST = 5000;

// 공백만 있는 문자열/문자열이 아닌 값은 null로 통일합니다.
const normalizeNonBlankString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

/**
 * 알림 전송을 담당하는 서비스입니다.
 * 1) 단일 토큰 즉시 전송
 * 2) 다중 토큰 비동기 배치 전송
 *
 * 배치 요청은 메모리 큐(FIFO)에 넣고, 워커 1개가 순차 처리합니다.
 * 이렇게 하면 워커가 중복 실행되는 문제를 막고, Firebase 호출량을 안정적으로 제어할 수 있습니다.
 */
@Injectable()
export class AppService {
  // 비동기 배치 요청을 순서대로 처리하기 위한 메모리 큐입니다.
  private readonly batchQueue: NotificationBatchQueueItem[] = [];
  // 현재 워커 실행 여부를 나타냅니다. true면 새 워커를 만들지 않습니다.
  private isBatchProcessing = false;

  getHello(): string {
    return 'Hello World!';
  }

  /**
   * 단일 디바이스 토큰으로 즉시 푸시 알림을 보냅니다.
   * 필수값: token, title, body
   */
  async sendNotification(payload: NotificationDataPayload): Promise<void> {
    const token = normalizeNonBlankString(payload.token);
    const title = normalizeNonBlankString(payload.title);
    const body = normalizeNonBlankString(payload.body);
    const type = normalizeNonBlankString(payload.type);
    const itemId = normalizeNonBlankString(payload.itemId);
    const sectionId = normalizeNonBlankString(payload.sectionId);

    if (!token || !title || !body) {
      throw new BadRequestException('token, title, body are required.');
    }

    const message = this.buildSingleMessage(
      token,
      title,
      body,
      type,
      itemId,
      sectionId,
    );

    try {
      await admin.messaging().send(message);
    } catch (error) {
      console.error('Error sending message:', error);
      throw new InternalServerErrorException('Failed to send notification.');
    }
  }

  /**
   * 배치 푸시 요청을 큐에 넣고 즉시 응답합니다.
   * 실제 전송은 백그라운드 워커(processBatchQueue)에서 처리합니다.
   * 즉, 여기서는 "검증 + 큐 등록"까지만 담당합니다.
   */
  enqueueBatchNotification(
    payload: NotificationBatchPayload,
  ): EnqueueBatchNotificationResult {
    const title = normalizeNonBlankString(payload.title);
    const body = normalizeNonBlankString(payload.body);
    const type = normalizeNonBlankString(payload.type);
    const itemId = normalizeNonBlankString(payload.itemId);
    const sectionId = normalizeNonBlankString(payload.sectionId);
    const tokens = this.normalizeTokens(payload.tokens);

    if (!title || !body) {
      throw new BadRequestException('title and body are required.');
    }
    if (tokens.length === 0) {
      throw new BadRequestException('tokens is required.');
    }
    if (tokens.length > MAX_BATCH_TOKENS_PER_REQUEST) {
      throw new BadRequestException(
        `tokens must be <= ${MAX_BATCH_TOKENS_PER_REQUEST}.`,
      );
    }
    if (this.batchQueue.length >= MAX_BATCH_QUEUE_SIZE) {
      throw new ServiceUnavailableException('Notification queue is full.');
    }

    const requestId = randomUUID();
    this.batchQueue.push({
      requestId,
      tokens,
      title,
      body,
      type,
      itemId,
      sectionId,
    });
    this.triggerBatchProcessing();

    return { requestId, acceptedCount: tokens.length };
  }

  // 워커가 돌고 있지 않다면 다음 이벤트 루프 틱에서 워커를 시작합니다.
  private triggerBatchProcessing(): void {
    if (this.isBatchProcessing) {
      return;
    }
    setImmediate(() => {
      void this.processBatchQueue();
    });
  }

  // 큐가 빌 때까지 FIFO(먼저 들어온 요청 먼저 처리) 방식으로 작업을 꺼내 실행합니다.
  private async processBatchQueue(): Promise<void> {
    if (this.isBatchProcessing) {
      return;
    }

    this.isBatchProcessing = true;
    try {
      // 순차 처리로 동시 Firebase 호출 폭증을 막고 처리량을 예측 가능하게 유지합니다.
      while (true) {
        const item = this.batchQueue.shift();
        if (!item) {
          break;
        }
        await this.processBatchItem(item);
      }
    } finally {
      this.isBatchProcessing = false;
      if (this.batchQueue.length > 0) {
        this.triggerBatchProcessing();
      }
    }
  }

  // FCM 제약(최대 500개 토큰)에 맞춰 잘라서 멀티캐스트 전송합니다.
  private async processBatchItem(
    item: NotificationBatchQueueItem,
  ): Promise<void> {
    const { requestId, tokens, title, body, type, itemId, sectionId } = item;

    for (let i = 0; i < tokens.length; i += MULTICAST_CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + MULTICAST_CHUNK_SIZE);
      const multicastMessage = this.buildMulticastMessage(
        chunk,
        title,
        body,
        type,
        itemId,
        sectionId,
      );

      try {
        const response = await admin
          .messaging()
          .sendEachForMulticast(multicastMessage);

        if (response.failureCount > 0) {
          console.warn(
            `Batch notification partial failure. requestId=${requestId}, success=${response.successCount}, failure=${response.failureCount}`,
          );
        }
      } catch (error) {
        console.error(
          `Batch notification send failed. requestId=${requestId}`,
          error,
        );
      }
    }
  }

  // 유효하지 않은 토큰(빈 값 등)을 제거하고, 중복 토큰을 한 번만 남깁니다.
  private normalizeTokens(tokens: unknown): string[] {
    if (!Array.isArray(tokens)) {
      return [];
    }

    const normalized = tokens
      .map((token) => normalizeNonBlankString(token))
      .filter((token): token is string => token !== null);

    return Array.from(new Set(normalized));
  }

  // 알림과 함께 내려보낼 data payload를 구성합니다.
  // FCM data 값은 문자열만 허용하므로 문자열 필드만 넣습니다.
  private buildData(
    title: string,
    body: string,
    type: string | null,
    itemId: string | null,
    sectionId: string | null,
  ): Record<string, string> {
    const data: Record<string, string> = { title, body };

    if (type) {
      data.type = type;
    }
    if (itemId) {
      data.itemId = itemId;
    }
    if (sectionId) {
      data.sectionId = sectionId;
    }

    return data;
  }

  // 단일 토큰 전송용 메시지 객체를 만듭니다.
  private buildSingleMessage(
    token: string,
    title: string,
    body: string,
    type: string | null,
    itemId: string | null,
    sectionId: string | null,
  ): admin.messaging.Message {
    return {
      token,
      notification: {
        title,
        body,
      },
      data: this.buildData(title, body, type, itemId, sectionId),
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
  }

  // 다중 토큰 멀티캐스트 전송용 메시지 객체를 만듭니다.
  private buildMulticastMessage(
    tokens: string[],
    title: string,
    body: string,
    type: string | null,
    itemId: string | null,
    sectionId: string | null,
  ): admin.messaging.MulticastMessage {
    return {
      tokens,
      notification: {
        title,
        body,
      },
      data: this.buildData(title, body, type, itemId, sectionId),
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
  }
}
