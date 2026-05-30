import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class IcccAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request  = context.switchToHttp().getRequest<Request>();
    const expected = process.env.ICCC_TOKEN;

    const token =
      (request.headers['authorization']?.replace('Bearer ', '')) ??
      request.headers['x-iccc-token'];

    if (!token || token !== expected) {
      throw new UnauthorizedException('Invalid or missing ICCC token');
    }

    return true;
  }
}