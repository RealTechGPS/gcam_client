import { Module } from '@nestjs/common';
import { IcccController } from './iccc.controller';
import { IcccService } from './iccc.service';
// import { IcccGateway } from './iccc.gateway';


@Module({
  controllers: [IcccController],
  providers: [IcccService]
})
export class IcccModule {}
