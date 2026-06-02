import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

export const IST            = 'Asia/Kolkata';
export const FTP_LOCAL      = '/home/ftpuser/ftp/files/';
export const FTP_URL_LATEST = 'https://gcam-ftp.rtsiot.com/gcam/';
export const FTP_URL_REPORT = 'https://rtgpshost.ifill.in/gcam/';

// ──────────────────────────────────────────────────────────────────
// 👇 ONLY THIS NUMBER NEEDS TO CHANGE when server storage extends
//    1 = today only
//    2 = today + yesterday
//    3 = today + last 2 days
// ──────────────────────────────────────────────────────────────────
export const SERVER_STORAGE_DAYS = 1;

// ── Compare entirely in IST to avoid UTC midnight boundary issues ──
export const resolveBaseUrl = (logTime: Date | string | null | undefined): string => {
  if (!logTime) return FTP_URL_REPORT;

  // Both sides in IST, truncated to start-of-day so diff is always whole days
  const logDayIST = dayjs(logTime).tz(IST).startOf('day');
  const todayIST  = dayjs().tz(IST).startOf('day');

  // diffDays: 0 = today, 1 = yesterday, 2 = two days ago …
  const diffDays = todayIST.diff(logDayIST, 'day');

  return diffDays < SERVER_STORAGE_DAYS ? FTP_URL_LATEST : FTP_URL_REPORT;
};

// ─────────────────────────────────────────────────────────────────
export const toPublicUrl = (
  path: string | null | undefined,
  baseUrl: string,
): string | null => {
  if (!path) return null;
  return path.replace(FTP_LOCAL, baseUrl);
};

// ── Garbage ───────────────────────────────────────────────────────
export const shapeGarbageLog = (log: any, imei: string, baseUrl: string) => {
  if (!log) return null;
  return {
    mode:            log.mode,
    // ai_mode:         log.ai_mode,
    severity:        log.severity,
    device_id:       log.device_id,
    timestamp:       log.timestamp,
    // blob_count:      log.blob_count,
    // diff_ratio:      log.diff_ratio,
    // edge_ratio:      log.edge_ratio,
    image_file:      log.image_file,
    camera_name:     log.camera_name,
    // normal_mode:     log.normal_mode,
    // triggered_by:    log.triggered_by,
    garbage_count:   log.garbage_count,
    garbage_labels:  log.garbage_labels,
    blob_area_ratio: log.blob_area_ratio,
    // live_expires_at: log.live_expires_at,
    // reference_ready: log.reference_ready,
    image_path:      `${baseUrl}${imei}/Garbage/${log.image_file}`,
  };
};

// ── Motion ────────────────────────────────────────────────────────
export const shapeMotionLog = (log: any, baseUrl: string) => {
  if (!log) return null;
  return {
    date:              log.date,
    time:              log.time,
    event:             log.event,
    device_id:         log.device_id,
    image_file:        log.image_file,
    image_path:        toPublicUrl(log.image_path, baseUrl),
    video_file:        log.video_file,
    video_path:        toPublicUrl(log.video_path, baseUrl),
    camera_name:       log.camera_name,
    // duration_sec:      log.duration_sec,
    person_count:      log.person_count,
    video_status:      log.video_status,
    // local_deleted:     log.local_deleted,
    video_message:     log.video_message,
    // best_confidence:   log.best_confidence,
    video_uploaded_at: log.video_uploaded_at,
  };
};

// ── Video log (inside ANPR) ───────────────────────────────────────
export const shapeVideoLog = (log: any, baseUrl: string) => {
  if (!log) return null;
  return {
    date:            log.date,
    time:            log.time,
    event:           log.event,
    device_id:       log.device_id,
    // video_dir:       toPublicUrl(log.video_dir, baseUrl),
    image_file:      log.image_file,
    image_path:      toPublicUrl(log.image_path, baseUrl),
    video_file:      log.video_file,
    video_path:      toPublicUrl(log.video_path, baseUrl),
    camera_name:     log.camera_name,
    duration_sec:    log.duration_sec,
    // image_status:    log.image_status,
    // video_status:    log.video_status,
    // image_message:   log.image_message,
    vehicle_count:   log.vehicle_count,
    // video_message:   log.video_message,
    // vehicle_labels:  log.vehicle_labels,
    // best_confidence: log.best_confidence,
  };
};

// ── ANPR ──────────────────────────────────────────────────────────
export const shapeAnprLog = (log: any, video_log: any, baseUrl: string) => {
  if (!log) return null;
  return {
    plate_no:     log.plate_no,
    device_id:    log.device_id,
    file_name:    log.file_name,
    file_path:    toPublicUrl(log.file_path, baseUrl),
    timestamp:    log.timestamp,
    event_type:   log.event_type,
    captured_at:  log.captured_at,
    channel_name: log.channel_name,
    video_log:    shapeVideoLog(video_log, baseUrl),
  };
};