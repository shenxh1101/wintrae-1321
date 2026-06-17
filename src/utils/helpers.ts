import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { runSQL, getOne, getAll } from '../database';

export function changePoints(
  memberId: string,
  change: number,
  type: 'check_in' | 'review' | 'no_show' | 'promotion' | 'other',
  description: string,
  relatedBookingId?: string
): void {
  const recordId = uuidv4();
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  runSQL(`UPDATE members SET points = points + ? WHERE id = ?`, [change, memberId]);

  runSQL(
    `INSERT INTO points_records (id, member_id, change, type, description, related_booking_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [recordId, memberId, change, type, description, relatedBookingId || null, now]
  );

  createNotification(
    memberId,
    'points',
    change > 0 ? '积分增加通知' : '积分扣除通知',
    `${description}，${change > 0 ? '+' : ''}${change} 积分`
  );
}

export function createNotification(
  memberId: string,
  type: 'points' | 'booking' | 'waitlist' | 'reminder',
  title: string,
  content: string
): void {
  const id = uuidv4();
  const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

  runSQL(
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

export function updateWaitlistPositions(scheduleId: string): void {
  const rows = getAll<any>(
    `SELECT id, member_id FROM bookings WHERE schedule_id = ? AND is_waitlist = 1 AND status = 'waitlisted' ORDER BY created_at ASC`,
    [scheduleId]
  );

  for (let i = 0; i < rows.length; i++) {
    runSQL(`UPDATE bookings SET waitlist_position = ? WHERE id = ?`, [i + 1, rows[i].id]);
  }

  runSQL(
    `UPDATE coach_schedules SET waitlist_count = ? WHERE id = ?`,
    [rows.length, scheduleId]
  );
}

export function getWaitlistFirst(scheduleId: string): any {
  return getOne<any>(
    `SELECT b.id, b.member_id, m.remaining_count, m.status, m.membership_end
     FROM bookings b
     INNER JOIN members m ON b.member_id = m.id
     WHERE b.schedule_id = ? AND b.is_waitlist = 1 AND b.status = 'waitlisted'
     ORDER BY b.created_at ASC
     LIMIT 1`,
    [scheduleId]
  );
}

export function processWaitlistPromotion(scheduleId: string, count: number = 1): number {
  let promotedCount = 0;

  for (let i = 0; i < count; i++) {
    const schedule = getOne<any>(
      `SELECT cs.capacity,
        (SELECT COUNT(*) FROM bookings WHERE schedule_id = cs.id AND status = 'booked') as actual_booked
       FROM coach_schedules cs WHERE cs.id = ?`,
      [scheduleId]
    );

    if (!schedule) break;
    if (schedule.actual_booked >= schedule.capacity) break;

    const firstWaitlist = getWaitlistFirst(scheduleId);
    if (!firstWaitlist) break;

    if (firstWaitlist.status !== 'active') {
      runSQL(
        `UPDATE bookings SET status = 'cancelled', cancel_reason = '会员状态异常，候补转正失败' WHERE id = ?`,
        [firstWaitlist.id]
      );
      updateWaitlistPositions(scheduleId);
      createNotification(
        firstWaitlist.member_id,
        'waitlist',
        '候补转正失败',
        '很抱歉，由于您的会员状态异常，候补转正失败，已自动退出候补队列。'
      );
      continue;
    }

    if (dayjs(firstWaitlist.membership_end).isBefore(dayjs())) {
      runSQL(
        `UPDATE bookings SET status = 'cancelled', cancel_reason = '会员已过期，候补转正失败' WHERE id = ?`,
        [firstWaitlist.id]
      );
      updateWaitlistPositions(scheduleId);
      createNotification(
        firstWaitlist.member_id,
        'waitlist',
        '候补转正失败',
        '很抱歉，由于您的会员已过期，候补转正失败，已自动退出候补队列。'
      );
      continue;
    }

    if (firstWaitlist.remaining_count <= 0) {
      runSQL(
        `UPDATE bookings SET status = 'cancelled', cancel_reason = '剩余次数不足，候补转正失败' WHERE id = ?`,
        [firstWaitlist.id]
      );
      updateWaitlistPositions(scheduleId);
      createNotification(
        firstWaitlist.member_id,
        'waitlist',
        '候补转正失败',
        '很抱歉，由于您的剩余次数不足，候补转正失败，已自动退出候补队列。'
      );
      continue;
    }

    const checkInCode = generateCheckInCode();
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');

    runSQL(
      `UPDATE bookings SET status = 'booked', is_waitlist = 0, waitlist_position = NULL, check_in_code = ?, created_at = ? WHERE id = ?`,
      [checkInCode, now, firstWaitlist.id]
    );

    runSQL(
      `UPDATE coach_schedules SET booked_count = booked_count + 1, waitlist_count = waitlist_count - 1 WHERE id = ?`,
      [scheduleId]
    );

    runSQL(
      `UPDATE members SET remaining_count = remaining_count - 1 WHERE id = ?`,
      [firstWaitlist.member_id]
    );

    updateWaitlistPositions(scheduleId);

    const scheduleDetail = getOne<any>(
      `SELECT cs.date, cs.start_time, c.name as course_name, co.name as coach_name, s.name as store_name
       FROM coach_schedules cs
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN coaches co ON cs.coach_id = co.id
       INNER JOIN stores s ON cs.store_id = s.id
       WHERE cs.id = ?`,
      [scheduleId]
    );

    if (scheduleDetail) {
      createNotification(
        firstWaitlist.member_id,
        'waitlist',
        '候补成功通知',
        `恭喜您！${scheduleDetail.date} ${scheduleDetail.start_time} ${scheduleDetail.course_name}（${scheduleDetail.coach_name}教练 - ${scheduleDetail.store_name}）的候补已成功转为正式预约。签到码：${checkInCode}，请准时到店签到。`
      );
    }

    promotedCount++;
  }

  return promotedCount;
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
