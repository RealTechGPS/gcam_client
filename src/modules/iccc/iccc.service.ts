import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import {
  IST,
  FTP_LOCAL,
  FTP_URL_LATEST,
  shapeGarbageLog,
  shapeMotionLog,
  shapeAnprLog,
  shapeVideoLog,
  resolveBaseUrl,
} from 'src/common/helpers/log-shape.helper';
import { SftpService } from 'src/configs/sftp/sftp.service';
import 'multer'
dayjs.extend(utc);
dayjs.extend(timezone);

const ANPR_VIDEO_BUFFER_SEC = 60;
const ORG_ID                = 6;
const MAX_DAYS              = 7;
const BASE_PATH = '/home/ftpuser/ftp/files';

// ── Date range validator — all comparisons in IST ─────────────────
const validateDateRange = (from: string, to: string) => {
  const fromD = dayjs(from).tz(IST);
  const toD   = dayjs(to).tz(IST);

  if (!fromD.isValid() || !toD.isValid()) {
    throw new BadRequestException('Invalid date format');
  }
  if (toD.diff(fromD, 'day') > MAX_DAYS) {
    throw new BadRequestException(`Date range cannot exceed ${MAX_DAYS} days`);
  }

  return {
    fromUTC: fromD.utc().toDate(),
    toUTC:   toD.utc().toDate(),
  };
};

@Injectable()
export class IcccService {
  constructor(
    private prisma: PrismaService,
    private sftpService: SftpService
  ) {}

  // ── Guard: imei must belong to org 6 ─────────────────────────────
  private async resolveDevice(imei: string): Promise<{ imei: string }> {
    const device = await this.prisma.device.findUnique({
      where: { imei, is_active: true },
      select: { imei: true, organization_id: true },
    });

    if (!device) throw new NotFoundException('Device not found');
    if (device.organization_id !== ORG_ID) {
      throw new ForbiddenException('Device does not belong to this organization');
    }

    return { imei: device.imei };
  }

  //  GET - /iccc/devices 
  async getDevices() {
    const org = await this.prisma.organization.findUnique({
      where: { id: ORG_ID },
      select: {
        Site: {
          select: {
            name: true,
            location: true,
            Device: {
              select: {
                imei: true,
                name: true,
                location: true,
                video_url: true,
                LatestLog: {
                  select: {
                    garbage_log:                true,
                    garbage_log_time:           true,
                    motion_log:                 true,
                    motion_log_time:            true,
                    anpr_log:                   true,
                    anpr_log_time:              true,
                    vehicle_detection_log:      true,
                    vehicle_detection_log_time: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const data = {
      ...org,
      Site: org?.Site?.map((site) => ({
        ...site,
        Device: site.Device.map((device) => {
          const log = device.LatestLog;

          // ── ANPR video window check ───────────────────────────────
          let matchedVideoLog: any = null;
          if (log?.anpr_log_time && log?.vehicle_detection_log_time) {
            const anprTime    = dayjs(log.anpr_log_time).tz(IST);
            const vehicleTime = dayjs(log.vehicle_detection_log_time).tz(IST);
            const windowFrom  = anprTime.subtract(ANPR_VIDEO_BUFFER_SEC, 'second');
            const windowTo    = anprTime.add(ANPR_VIDEO_BUFFER_SEC, 'second');

            if (vehicleTime.isAfter(windowFrom) && vehicleTime.isBefore(windowTo)) {
              matchedVideoLog = log.vehicle_detection_log;
            }
          }

          return {
            imei:     device.imei,
            name:     device.name,
            location: device.location,
            live_url: device.video_url,
            LatestLog: log
              ? {
                  garbage_log:      shapeGarbageLog(log.garbage_log, device.imei, FTP_URL_LATEST),
                  garbage_log_time: log.garbage_log_time,
                  motion_log:       shapeMotionLog(log.motion_log, FTP_URL_LATEST),
                  motion_log_time:  log.motion_log_time,
                  anpr_log:         shapeAnprLog(log.anpr_log, matchedVideoLog, FTP_URL_LATEST),
                  anpr_log_time:    log.anpr_log_time,
                  // vehicle_detection_log intentionally excluded
                }
              : null,
          };
        }),
      })),
    };

    return { status: 'success', data };
  }

  //  POST - /iccc/report/garbage_logs
  async getGarbageLogs(imei: string, from: string, to: string) {
    const { fromUTC, toUTC }   = validateDateRange(from, to);
    const { imei: deviceImei } = await this.resolveDevice(imei);

    const logs = await this.prisma.garbageLog.findMany({
      where: {
        imei: deviceImei,
        time: { gte: fromUTC, lte: toUTC },
      },
      select:  { time: true, data: true },
      orderBy: { time: 'desc' },
    });

    const data = logs.map((log) => ({
      time: log.time,
      // log.time from DB is UTC — resolveBaseUrl converts to IST internally before comparing
      data: shapeGarbageLog(log.data, deviceImei, resolveBaseUrl(log.time)),
    }));

    return { status: 'success', data };
  }

  //  POST - /iccc/report/person_logs
  async getMotionLogs(imei: string, from: string, to: string) {
    const { fromUTC, toUTC }   = validateDateRange(from, to);
    const { imei: deviceImei } = await this.resolveDevice(imei);

    const logs = await this.prisma.motionLog.findMany({
      where: {
        imei: deviceImei,
        time: { gte: fromUTC, lte: toUTC },
      },
      select:  { time: true, data: true },
      orderBy: { time: 'desc' },
    });

    const data = logs.map((log) => ({
      time: log.time,
      data: shapeMotionLog(log.data, resolveBaseUrl(log.time)),
    }));

    return { status: 'success', data };
  }

  //  POST - /iccc/report/anpr_logs
  async getAnprLogs(imei: string, from: string, to: string) {
    const MAX_EDIT_DISTANCE       = 2;
    const VIDEO_BUFFER_BEFORE_SEC = 60;
    const VIDEO_BUFFER_AFTER_SEC  = 60;

    const { fromUTC, toUTC }   = validateDateRange(from, to);
    const { imei: deviceImei } = await this.resolveDevice(imei);

    // 1. ANPR logs asc for correct grouping
    const anprLogs = await this.prisma.anprImagesLog.findMany({
      where: {
        imei: deviceImei,
        time: { gte: fromUTC, lte: toUTC },
      },
      select:  { time: true, data: true },
      orderBy: { time: 'asc' },
    });

    // 2. Vehicle detection logs in expanded window — one query
    const videoWindowFrom = dayjs(fromUTC).subtract(VIDEO_BUFFER_BEFORE_SEC, 'second').toDate();
    const videoWindowTo   = dayjs(toUTC).add(VIDEO_BUFFER_AFTER_SEC, 'second').toDate();

    const allVideoLogs = await this.prisma.vehicleDetectionLog.findMany({
      where: {
        imei: deviceImei,
        time: { gte: videoWindowFrom, lte: videoWindowTo },
      },
      select:  { time: true, data: true },
      orderBy: { time: 'asc' },
    });

    // 3. Levenshtein helper
    const levenshtein = (a: string, b: string): number => {
      const m = a.length, n = b.length;
      const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
      );
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          dp[i][j] =
            a[i - 1] === b[j - 1]
              ? dp[i - 1][j - 1]
              : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
        }
      }
      return dp[m][n];
    };

    const isSimilarPlate = (plateA: string, plateB: string): boolean => {
      if (plateA === plateB) return true;
      if (Math.abs(plateA.length - plateB.length) > 2) return false;
      return levenshtein(plateA, plateB) <= MAX_EDIT_DISTANCE;
    };

    // 4. Group by plate — store time alongside data for url resolution
    const groups: any[] = [];

    for (const log of anprLogs) {
      const plateNo = (log.data as any)?.plate_no;
      if (!plateNo) continue;

      const matchedGroup = groups.find((g) => isSimilarPlate(g.vehicle_no, plateNo));

      if (matchedGroup) {
        matchedGroup._endTime = log.time;
        matchedGroup._plateCounts[plateNo] = (matchedGroup._plateCounts[plateNo] || 0) + 1;
        matchedGroup.images.push({ data: log.data, time: log.time });
      } else {
        groups.push({
          vehicle_no:   plateNo,
          _startTime:   log.time,
          _endTime:     log.time,
          _plateCounts: { [plateNo]: 1 },
          images:       [{ data: log.data, time: log.time }],
        });
      }
    }

    // 5. Match video logs in memory per group + shape with resolved url
    const result = groups.map((group) => {
      const canonicalPlate = Object.entries(group._plateCounts).sort(
        (a: any, b: any) => b[1] - a[1]
      )[0][0];

      // All time formatting in IST
      const startIST = dayjs(group._startTime).tz(IST);
      const endIST   = dayjs(group._endTime).tz(IST);

      const videoFrom = dayjs(group._startTime).tz(IST).subtract(VIDEO_BUFFER_BEFORE_SEC, 'second');
      const videoTo   = dayjs(group._endTime).tz(IST).add(VIDEO_BUFFER_AFTER_SEC, 'second');

      const video_logs = allVideoLogs
        .filter((v) => {
          const t = dayjs(v.time).tz(IST);
          return t.isAfter(videoFrom) && t.isBefore(videoTo);
        })
        .map((v) => shapeVideoLog(v.data, resolveBaseUrl(v.time)));

      const first     = group.images[0];
      const firstData = first.data as any;
      const firstUrl  = resolveBaseUrl(first.time);

      return {
        vehicle_no:      canonicalPlate,
        time_range:      `${startIST.format('HH:mm')}-${endIST.format('HH:mm')}`,
        time_range_full: {
          from: startIST.format('YYYY-MM-DD HH:mm:ss'),
          to:   endIST.format('YYYY-MM-DD HH:mm:ss'),
        },
        total_detections: group.images.length,
        images: [
          {
            ...firstData,
            file_path: firstData?.file_path
              ? firstData.file_path.replace(FTP_LOCAL, firstUrl)
              : null,
          },
        ],
        video_logs,
      };
    });

    result.reverse();

    return { status: 'success', data: result };
  }

  // POST - /iccc/audio/upload/:imei 
  async uploadDeviceAudio(imei: string, file: Express.Multer.File) {
    const { imei: deviceImei } = await this.resolveDevice(imei);

    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const sftp         = await this.sftpService.getClient();
    const remoteDir    = `${BASE_PATH}/${deviceImei}/Audio`;
    const remotePath   = `${remoteDir}/${file.originalname}`;

    await sftp.mkdir(remoteDir, true);
    await sftp.put(file.buffer, remotePath);

    return {
      status:  'success',
      message: 'File uploaded',
      file:    remotePath,
    };
  }

  // GET /iccc/audio/default
  async getDefaultAudios() {
    const sftp     = await this.sftpService.getClient();
    const fileList = await sftp.list(`${BASE_PATH}/Default_Audio`);

    const data = fileList
      .filter((f) => f.type === '-')
      .map((f) => ({
        name:       f.name,
        size:       f.size,
        modifyTime: f.modifyTime,
      }));

    return {
      status:  'success',
      message: 'Files fetched successfully',
      count:   data.length,
      data,
    };
  }

  // GET /iccc/audio/device/:imei
  async getDeviceAudios(imei: string) {
    const { imei: deviceImei } = await this.resolveDevice(imei);

    const sftp     = await this.sftpService.getClient();
    const fileList = await sftp.list(`${BASE_PATH}/${deviceImei}/Audio`);

    const data = fileList
      .filter((f) => f.type === '-')
      .map((f) => ({
        name:       f.name,
        size:       f.size,
        modifyTime: f.modifyTime,
      }));

    return {
      status:  'success',
      message: 'Files fetched successfully',
      count:   data.length,
      data,
    };
  }
}