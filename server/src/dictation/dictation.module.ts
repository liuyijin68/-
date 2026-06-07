import { Module } from '@nestjs/common';
import { DictationController } from './dictation.controller';

@Module({
  controllers: [DictationController],
})
export class DictationModule {}