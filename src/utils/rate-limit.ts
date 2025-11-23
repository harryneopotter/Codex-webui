import { IncomingMessage } from 'http';

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // 100 requests per window

interface RateLimitRecord {
  count: number;
  startTime: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

// Cleanup rate limit map periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now - record.startTime > RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW);

export function checkRateLimit(req: IncomingMessage): boolean {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = rateLimitMap.get(ip) || { count: 0, startTime: now };

  if (now - record.startTime > RATE_LIMIT_WINDOW) {
    record.count = 1;
    record.startTime = now;
  } else {
    record.count++;
  }
  
  rateLimitMap.set(ip, record);
  return record.count <= RATE_LIMIT_MAX;
}
