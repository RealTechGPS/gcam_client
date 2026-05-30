import { Global, Module } from '@nestjs/common';
import { SftpService } from './sftp.service';


@Global()
@Module({
  providers: [SftpService],
  exports:   [SftpService],
})
export class SftpModule {}