// mqtt.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import * as mqtt from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit {
  private client!: mqtt.MqttClient;

  onModuleInit() {
    this.client = mqtt.connect(process.env.MQTT_URL as string, {
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
    });

    this.client.on('connect', () => console.log('✅ MQTT Connected'));
    this.client.on('error',   (err) => console.log('❌ MQTT Error:', err));
  }

  publish(topic: string, payload: any) {
    this.client.publish(topic, JSON.stringify(payload));
  }

  subscribe(topic: string) {
    this.client.subscribe(topic);
  }

  unsubscribe(topic: string) {
    this.client.unsubscribe(topic);
  }

  // Global listener — existing usage untouched
  onMessage(callback: (topic: string, message: any) => void) {
    this.client.on('message', (topic, message) => {
      callback(topic, JSON.parse(message.toString()));
    });
  }

  // Per-handler listener — used by gateway for scoped response handling
  addMessageHandler(handler: (topic: string, message: Buffer) => void) {
    this.client.on('message', handler);
  }

  removeMessageHandler(handler: (topic: string, message: Buffer) => void) {
    this.client.off('message', handler);
  }
}