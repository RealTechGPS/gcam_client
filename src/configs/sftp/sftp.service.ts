import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import SftpClient from 'ssh2-sftp-client';

@Injectable()
export class SftpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SftpService.name);
  private client: SftpClient;
  private connected = false;

  constructor() {
    this.client = new SftpClient();
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect() {
    try {
      await this.client.connect({
        host:       process.env.SFTP_HOST,
        port:       Number(process.env.SFTP_PORT ?? 22),
        username:   process.env.SFTP_USERNAME,
        password:   process.env.SFTP_PASSWORD,
      });
      this.connected = true;
      this.logger.log('✅ SFTP Connected');
    } catch (err) {
      this.connected = false;
      this.logger.error('❌ SFTP Connection failed:', err);
    }
  }

  private async disconnect() {
    try {
      await this.client.end();
      this.connected = false;
      this.logger.log('SFTP Disconnected');
    } catch {
      // ignore on shutdown
    }
  }

  // Auto-reconnect wrapper — call this before every operation
  async getClient(): Promise<SftpClient> {
    if (!this.connected) {
      this.logger.warn('SFTP not connected — reconnecting...');
      await this.connect();
    }
    return this.client;
  }
}