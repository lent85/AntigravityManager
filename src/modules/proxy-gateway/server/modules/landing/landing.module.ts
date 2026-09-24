import { Module } from '@nestjs/common';
import { LandingController } from './landing.controller';
import { AccountLeaseModule } from '../account-lease/account-lease.module';

@Module({
  imports: [AccountLeaseModule],
  controllers: [LandingController],
})
export class LandingModule {}
