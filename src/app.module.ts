import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { NotificationController } from './notification.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController, NotificationController],
  providers: [AppService],
})
export class AppModule {}
