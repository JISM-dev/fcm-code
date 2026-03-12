import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AppService } from './app.service';
import type {
  EnqueueBatchNotificationResult,
  NotificationBatchPayload,
  NotificationDataPayload,
} from './notification.types';

@Controller('notification')
export class NotificationController {
  constructor(private readonly appService: AppService) {}

  @Post('send')
  async send(@Body() payload: NotificationDataPayload): Promise<{ ok: true }> {
    await this.appService.sendNotification(payload);
    return { ok: true };
  }

  @Post('send/async')
  @HttpCode(HttpStatus.ACCEPTED)
  sendBatch(@Body() payload: NotificationBatchPayload): {
    ok: true;
    requestId: EnqueueBatchNotificationResult['requestId'];
    acceptedCount: EnqueueBatchNotificationResult['acceptedCount'];
  } {
    const result = this.appService.enqueueBatchNotification(payload);
    return {
      ok: true,
      requestId: result.requestId,
      acceptedCount: result.acceptedCount,
    };
  }
}
