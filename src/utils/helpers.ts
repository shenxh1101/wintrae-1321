import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { runSQL, getOne } from '../database';

export async function changePoints(
  memberId: string,
  change: number,
  type: 'check_in' | 'review' | 'no_show' | 'promotion' | 'other',
  description: string,
  relatedBookingId?: string
): Promise<void> {
  const recordId = uuidv4();
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  await runSQL(`UPDATE members SET points = points + ? WHERE id = ?`, [change, memberId]);

  await runSQL(
    `INSERT INTO points_records (id, member_id, change, type, description, related_booking_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [recordId, memberId, change, type, description, relatedBookingId || null, now]
  );

  await createNotification(
    memberId,
    'points',
    change > 0 ? '积分增加通知' : '积分扣除通知',
    `${description}，${change > 0 ? '+' : ''}${change} 积分`
  );
}

export async function createNotification(
  memberId: string,
  type: 'points' | 'booking' | 'waitlist' | 'reminder',
  title: string,
  content: string
): Promise<void> {
  const id = uuidv4();
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  await runSQL(
    `INSERT INTO notifications (id, member_id, type, title, content, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [id, memberId, type, title, content, now]
  );
}

export function generateCheckInCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function generateBookingNo(): string {
  return dayjs().format('YYYYMMDDHHmmss') + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function updateWaitlistPositions(scheduleId: string): Promise<void> {
  const waitlistBookings = await getOne<any[]>(
    `SELECT id FROM bookings WHERE schedule_id = ? AND is_waitlist = 1 AND status = 'waitlisted' ORDER BY created_at ASC`,
    [scheduleId]
  ) as any;

  const rows = await getOne<any>(
    `SELECT GROUP_CONCAT(id) as ids FROM bookings WHERE schedule_id = ? AND is_waitlist = 1 AND status = 'waitlisted' ORDER BY created_at ASC`,
    [scheduleId]
  );

  if (rows && rows.ids) {
    const ids = rows.ids.split(',');
    for (let i = 0; i < ids.length; i++) {
      await runSQL(`UPDATE bookings SET waitlist_position = ? WHERE id = ?`, [i + 1, ids[i]]);
    }
  }

  await runSQL(`UPDATE coach_schedules SET waitlist_count = (SELECT COUNT(*) FROM bookings WHERE schedule_id = ? AND is_waitlist = 1 AND status = 'waitlisted') WHERE id = ?`, [scheduleId, scheduleId]);
}

export async function processWaitlistPromotion(scheduleId: string): Promise<void> {
  const schedule = await getOne<any>(
    `SELECT cs.*, (SELECT COUNT(*) FROM bookings WHERE schedule_id = cs.id AND status = 'booked') as actual_booked FROM coach_schedules cs WHERE cs.id = ?`,
    [scheduleId]
  );

  if (!schedule) return;

  const availableSlots = schedule.capacity - schedule.actual_booked;

  if (availableSlots > 0) {
    const waitlistRows = await getOne<any>(
      `SELECT GROUP_CONCAT(id || ':' || member_id) as data FROM bookings WHERE schedule_id = ? AND is_waitlist = 1 AND status = 'waitlisted' ORDER BY created_at ASC LIMIT ?`,
      [scheduleId, availableSlots]
    );

    if (waitlistRows && waitlistRows.data) {
      const items = waitlistRows.data.split(',');
      for (const item of items) {
        const [bookingId, memberId] = item.split(':');
        const checkInCode = generateCheckInCode();

        await runSQL(
          `UPDATE bookings SET status = 'booked', is_waitlist = 0, waitlist_position = NULL, check_in_code = ? WHERE id = ?`,
          [checkInCode, bookingId]
        );

        await runSQL(
          `UPDATE coach_schedules SET booked_count = booked_count + 1 WHERE id = ?`,
          [scheduleId]
        );

        await createNotification(
          memberId,
          'waitlist',
          '候补成功通知',
          '恭喜您！您的候补预约已成功转为正式预约，请准时到店签到。'
        );
      }

      await updateWaitlistPositions(scheduleId);
    }
  }
}

export function parseBooleanParam(value: any): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return undefined;
}

export function parseIntParam(value: any, defaultValue?: number): number | undefined {
  if (value === undefined || value === null || value === '') return defaultValue;
  const num = parseInt(value, 10);
  return isNaN(num) ? defaultValue : num;
}
