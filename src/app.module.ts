import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IcccModule } from './modules/iccc/iccc.module';
import { PrismaModule } from './prisma/prisma.module';
import { MqttModule } from './configs/mqtt/mqtt.module';
import { SftpModule } from './configs/sftp/sftp.module';




@Module({
  imports: [
    ConfigModule.forRoot({}), 
    IcccModule,
    PrismaModule,
    MqttModule,
    SftpModule
  ],
})
export class AppModule {}