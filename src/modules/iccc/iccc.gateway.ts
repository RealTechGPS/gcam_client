import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';

import { MqttService } from 'src/configs/mqtt/mqtt.service';
import { PrismaService } from 'src/prisma/prisma.service';

// ── Constants ─────────────────────────────────────────────────────────────────
const ORG_ID              = 6;
const DEVICE_TOKEN        ='GCAM_SECRET_123';
const ICCC_WS_TOKEN       = process.env.ICCC_TOKEN    ?? 'ICCC_SECRET';
const RESPONSE_TIMEOUT_MS = 10_000;

// ── Command → expected response events mapping ────────────────────────────────
interface CommandEventConfig {
  started?:  string;
  resolved:  string;
  failed?:   string;
}

const COMMAND_EVENT_MAP: { prefix: string; config: CommandEventConfig }[] = [
  {
    prefix: 'Play Default Audio',
    config: {
      started:  'default_audio_play_started',
      resolved: 'default_audio_play_completed',
    },
  },
  {
    prefix: 'Audio File Play',
    config: {
      resolved: 'audio_play_completed',
    },
  },
  {
    prefix: 'Pi Volume',
    config: {
      resolved: 'pi_volume_set',
    },
  },
  {
    prefix: 'Queue Clear',
    config: {
      resolved: 'queue_cleared',
      failed:   'queue_clear_failed',
    },
  },
];

function resolveCommandConfig(command: string): CommandEventConfig | null {
  const match = COMMAND_EVENT_MAP.find(
    ({ prefix }) => command === prefix || command.startsWith(prefix),
  );
  return match?.config ?? null;
}

// ── Gateway ───────────────────────────────────────────────────────────────────
@WebSocketGateway({
  namespace: '/iccc',
  cors: { origin: '*' },
})
export class IcccGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly mqttService: MqttService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Connection guard ──────────────────────────────────────────────────────
  handleConnection(client: Socket) {
    const token =
      client.handshake.auth?.token ??
      client.handshake.headers?.['x-iccc-token'];

    if (token !== ICCC_WS_TOKEN) {
      console.warn(`Unauthorized WS connection rejected: ${client.id}`);
      client.emit('iccc/error', { message: 'Unauthorized' });
      client.disconnect(true);
      return;
    }

    console.log('ICCC client connected:', client.id);
  }

  handleDisconnect(client: Socket) {
    console.log('ICCC client disconnected:', client.id);
  }

  // ── Device org-guard ──────────────────────────────────────────────────────
  private async resolveDevice(imei: string): Promise<void> {
    const device = await this.prisma.device.findFirst({
      where:  { imei, is_active: true },
      select: { imei: true, organization_id: true },
    });

    if (!device) throw new NotFoundException('Device not found');
    if (device.organization_id !== ORG_ID) {
      throw new ForbiddenException('Device does not belong to this organization');
    }
  }

  // ── iccc/device_command ───────────────────────────────────────────────────
  /**
   * Client sends on:   "iccc/device_command"
   * { imei: string, command: string, audio_name?: string }
   *
   * Client listens on: "iccc/device_response"
   * success:      { status: 'success',  imei, event, data }
   * intermediate: { status: 'started',  imei, event, data }
   * error:        { status: 'error',    imei, event?, message }
   */
  @SubscribeMessage('iccc/device_command')
  async handleDeviceCommand(
    @MessageBody()     payload: { imei: string; command: string; audio_name?: string },
    @ConnectedSocket() client: Socket,
  ) {
    const { imei, command, audio_name } = payload ?? {};

    try {
      // ── 1. Validate payload ──────────────────────────────────────────────
      if (!imei || typeof imei !== 'string') {
        throw new BadRequestException('imei is required');
      }
      if (!command || typeof command !== 'string') {
        throw new BadRequestException('command is required');
      }

      // ── 2. Org-guard ─────────────────────────────────────────────────────
      await this.resolveDevice(imei);

      // ── 3. Resolve command config ────────────────────────────────────────
      const config = resolveCommandConfig(command);
      if (!config) {
        throw new BadRequestException(`Unknown command: "${command}"`);
      }

      // ── 4. Build MQTT message ────────────────────────────────────────────
      const mqttMessage: Record<string, any> = { command, token: DEVICE_TOKEN };
      if (audio_name) mqttMessage.audio_name = audio_name;

      const commandTopic  = `${imei}/command`;
      const responseTopic = `${imei}/device_response`;

      // ── 5. Subscribe → publish → wait for matching event ─────────────────
      await new Promise<void>((resolve, reject) => {

        const cleanup = () => {
          this.mqttService.removeMessageHandler(handler);
          this.mqttService.unsubscribe(responseTopic);
        };

        const timer = setTimeout(() => {
          cleanup();
          reject(new Error(`Timeout waiting for "${config.resolved}" response`));
        }, RESPONSE_TIMEOUT_MS);

        const handler = (topic: string, message: Buffer) => {
          // ignore messages from other topics
          if (topic !== responseTopic) return;

          try {
            const parsed = JSON.parse(message.toString());
            const event: string = parsed?.event;

            if (!event) return;

            // ── Intermediate started event — emit but keep waiting ────────
            if (config.started && event === config.started) {
              client.emit('iccc/device_response', {
                status: 'started',
                imei,
                event,
                data: parsed,
              });
              return;
            }

            // ── Failure event ─────────────────────────────────────────────
            if (config.failed && event === config.failed) {
              clearTimeout(timer);
              cleanup();
              client.emit('iccc/device_response', {
                status:  'error',
                imei,
                event,
                message: parsed?.message ?? `Command failed: ${event}`,
                data:    parsed,
              });
              resolve();
              return;
            }

            // ── Final resolved event ──────────────────────────────────────
            if (event === config.resolved) {
              clearTimeout(timer);
              cleanup();
              client.emit('iccc/device_response', {
                status: 'success',
                imei,
                event,
                data:   parsed,
              });
              resolve();
            }

            // unrelated event — ignore, keep waiting

          } catch {
            // malformed JSON — keep waiting
          }
        };

        this.mqttService.addMessageHandler(handler);
        this.mqttService.subscribe(responseTopic);
        this.mqttService.publish(commandTopic, mqttMessage);
      });

    } catch (err) {
    const error = err as Error;
    client.emit('iccc/device_response', {
        status:  'error',
        imei:    imei ?? null,
        message: error?.message ?? 'Internal error',
    });
    }
  }
}