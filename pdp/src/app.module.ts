import { Module } from '@nestjs/common';
import { PolicyModule } from './policy/policy.module';

@Module({
  imports: [PolicyModule],
})
export class AppModule {}