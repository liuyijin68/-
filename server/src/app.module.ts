import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { DictationModule } from '@/dictation/dictation.module';

@Module({
  imports: [
    // 配置 Multer 使用内存存储（支持 H5 和小程序跨端）
    MulterModule.register({
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    }),
    DictationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}