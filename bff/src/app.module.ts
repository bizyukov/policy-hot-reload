import { Module } from '@nestjs/common';
import { BffModule } from './bff/bff.module';

@Module({
  imports: [BffModule],
})
export class AppModule {}