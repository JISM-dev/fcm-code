import { Body, Controller, Post } from '@nestjs/common';
import { AppService } from './app.service';
import type { NotificationDataPayload } from './app.service';

@Controller('notification')
export class NotificationController {
  constructor(private readonly appService: AppService) {}

  @Post('send')
  async send(@Body() payload: NotificationDataPayload): Promise<{ ok: true }> {
    await this.appService.sendNotification(payload);
    return { ok: true };
  }
}
