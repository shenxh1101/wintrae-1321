import { Router, Response } from 'express';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { success, fail, paginated } from '../utils/response';
import { getOne, getAll, runSQL, transaction } from '../database';
import { changePoints, createNotification, parseIntParam, generateCheckInCode } from '../utils/helpers';
import { config } from '../config';

const router = Router();

router.post('/verify', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;
    const { checkInCode, scheduleId } = req.body;

    if (!checkInCode && !scheduleId) {
      return fail(res, '签到码或排班ID不能为空');
    }

    let booking: any;

    if (checkInCode) {
      booking = getOne<any>(
        `SELECT b.*, cs.date, cs.start_time, cs.end_time, cs.capacity, c.name as course_name, s.name as store_name
         FROM bookings b
         INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
         INNER JOIN courses c ON cs.course_id = c.id
         INNER JOIN stores s ON cs.store_id = s.id
         WHERE b.check_in_code = ? AND b.member_id = ?`,
        [checkInCode, memberId]
      );
    } else if (scheduleId) {
      booking = getOne<any>(
        `SELECT b.*, cs.date, cs.start_time, cs.end_time, cs.capacity, c.name as course_name, s.name as store_name
         FROM bookings b
         INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
         INNER JOIN courses c ON cs.course_id = c.id
         INNER JOIN stores s ON cs.store_id = s.id
         WHERE b.schedule_id = ? AND b.member_id = ? AND b.status = 'booked'`,
        [scheduleId, memberId]
      );
    }

    if (!booking) {
      return fail(res, '预约记录不存在');
    }

    if (booking.status === 'checked_in' || booking.status === 'completed') {
      return fail(res, '您已完成签到');
    }

    if (booking.status !== 'booked') {
      return fail(res, '当前状态无法签到');
    }

    const scheduleStart = dayjs(`${booking.date} ${booking.start_time}`);
    const scheduleEnd = dayjs(`${booking.date} ${booking.end_time}`);
    const now = dayjs();

    const minutesBeforeStart = scheduleStart.diff(now, 'minute');
    const isLate = minutesBeforeStart < 0;

    if (minutesBeforeStart > config.checkInWindowMinutes) {
      return fail(res, `签到时间未到，请在开课前${config.checkInWindowMinutes}分钟内签到`);
    }

    if (now.isAfter(scheduleEnd)) {
      return fail(res, '课程已结束，无法签到');
    }

    const checkInTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

    transaction(() => {
      runSQL(
        `UPDATE bookings SET status = 'checked_in', check_in_time = ? WHERE id = ?`,
        [checkInTime, booking.id]
      );
    });

    changePoints(
      memberId,
      5,
      'check_in',
      `${booking.date} ${booking.start_time} ${booking.course_name}签到成功`,
      booking.id
    );

    return success(res, {
      bookingId: booking.id,
      status: 'checked_in',
      checkInTime,
      isLate,
      pointsEarned: 5,
      message: isLate ? '签到成功（迟到）' : '签到成功'
    }, '签到成功');
  } catch (err: any) {
    return fail(res, err.message || '签到失败');
  }
});

router.post('/frontdesk/verify', async (req: AuthRequest, res: Response) => {
  try {
    const { checkInCode, scheduleId, memberPhone } = req.body;

    if (!checkInCode && !scheduleId && !memberPhone) {
      return fail(res, '签到码、排班ID或会员手机号不能为空');
    }

    let booking: any;

    if (checkInCode) {
      booking = getOne<any>(
        `SELECT b.*, m.name as member_name, m.phone as member_phone,
                cs.date, cs.start_time, cs.end_time, cs.capacity,
                c.name as course_name, s.name as store_name, co.name as coach_name
         FROM bookings b
         INNER JOIN members m ON b.member_id = m.id
         INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
         INNER JOIN courses c ON cs.course_id = c.id
         INNER JOIN stores s ON cs.store_id = s.id
         INNER JOIN coaches co ON cs.coach_id = co.id
         WHERE b.check_in_code = ?`,
        [checkInCode]
      );
    } else if (scheduleId && memberPhone) {
      booking = getOne<any>(
        `SELECT b.*, m.name as member_name, m.phone as member_phone,
                cs.date, cs.start_time, cs.end_time, cs.capacity,
                c.name as course_name, s.name as store_name, co.name as coach_name
         FROM bookings b
         INNER JOIN members m ON b.member_id = m.id
         INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
         INNER JOIN courses c ON cs.course_id = c.id
         INNER JOIN stores s ON cs.store_id = s.id
         INNER JOIN coaches co ON cs.coach_id = co.id
         WHERE b.schedule_id = ? AND m.phone = ? AND b.status = 'booked'`,
        [scheduleId, memberPhone]
      );
    }

    if (!booking) {
      return fail(res, '预约记录不存在，请确认信息');
    }

    if (booking.status === 'checked_in' || booking.status === 'completed') {
      return fail(res, '该会员已完成签到');
    }

    if (booking.status !== 'booked') {
      return fail(res, '当前预约状态无法签到');
    }

    const scheduleStart = dayjs(`${booking.date} ${booking.start_time}`);
    const scheduleEnd = dayjs(`${booking.date} ${booking.end_time}`);
    const now = dayjs();
    const minutesBeforeStart = scheduleStart.diff(now, 'minute');
    const isLate = minutesBeforeStart < 0;

    if (now.isAfter(scheduleEnd)) {
      return fail(res, '课程已结束，无法签到');
    }

    const checkInTime = dayjs().format('YYYY-MM-DD HH:mm:ss');

    transaction(() => {
      runSQL(
        `UPDATE bookings SET status = 'checked_in', check_in_time = ? WHERE id = ?`,
        [checkInTime, booking.id]
      );
    });

    changePoints(
      booking.member_id,
      5,
      'check_in',
      `${booking.date} ${booking.start_time} ${booking.course_name}签到成功`,
      booking.id
    );

    return success(res, {
      bookingId: booking.id,
      member: {
        id: booking.member_id,
        name: booking.member_name,
        phone: booking.member_phone
      },
      course: {
        name: booking.course_name,
        date: booking.date,
        startTime: booking.start_time,
        endTime: booking.end_time,
        coach: booking.coach_name,
        store: booking.store_name
      },
      status: 'checked_in',
      checkInTime,
      isLate,
      pointsEarned: 5
    }, '签到成功');
  } catch (err: any) {
    return fail(res, err.message || '签到失败');
  }
});

router.post('/mark-no-show', async (req: AuthRequest, res: Response) => {
  try {
    const { scheduleId } = req.body;

    if (!scheduleId) {
      return fail(res, '排班ID不能为空');
    }

    const schedule = getOne<any>(
      `SELECT cs.* FROM coach_schedules cs WHERE cs.id = ?`,
      [scheduleId]
    );

    if (!schedule) {
      return fail(res, '排班不存在');
    }

    const scheduleEnd = dayjs(`${schedule.date} ${schedule.end_time}`);
    if (dayjs().isBefore(scheduleEnd)) {
      return fail(res, '课程尚未结束，无法标记爽约');
    }

    const noShowBookings = getAll<any>(
      `SELECT b.*, m.name as member_name, c.name as course_name FROM bookings b
       INNER JOIN members m ON b.member_id = m.id
       INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
       INNER JOIN courses c ON cs.course_id = c.id
       WHERE b.schedule_id = ? AND b.status = 'booked'`,
      [scheduleId]
    );

    const markedCount = noShowBookings.length;

    for (const booking of noShowBookings) {
      transaction(() => {
        runSQL(
          `UPDATE bookings SET status = 'no_show' WHERE id = ?`,
          [booking.id]
        );
      });

      changePoints(
        booking.member_id,
        -config.noShowPenaltyPoints,
        'no_show',
        `${booking.date} ${booking.start_time} ${booking.course_name}未到店（爽约），扣除${config.noShowPenaltyPoints}积分`,
        booking.id
      );
    }

    runSQL(
      `UPDATE coach_schedules SET status = 'completed' WHERE id = ?`,
      [scheduleId]
    );

    return success(res, {
      markedCount,
      message: `已标记 ${markedCount} 位会员爽约`
    }, '处理完成');
  } catch (err: any) {
    return fail(res, err.message || '处理失败');
  }
});

router.get('/today-list', async (req: AuthRequest, res: Response) => {
  try {
    const { scheduleId, storeId } = req.query;
    const page = parseIntParam(req.query.page, 1) || 1;
    const pageSize = parseIntParam(req.query.pageSize, 50) || 50;
    const offset = (page - 1) * pageSize;

    const today = dayjs().format('YYYY-MM-DD');
    const conditions: string[] = [`cs.date = ?`];
    const params: any[] = [today];

    if (scheduleId) {
      conditions.push(`cs.id = ?`);
      params.push(scheduleId);
    }

    if (storeId) {
      conditions.push(`cs.store_id = ?`);
      params.push(storeId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = getOne<any>(
      `SELECT COUNT(*) as total FROM bookings b INNER JOIN coach_schedules cs ON b.schedule_id = cs.id ${whereClause}`,
      params
    );

    const list = getAll<any>(
      `SELECT b.*, m.name as member_name, m.phone as member_phone, m.avatar as member_avatar,
              cs.date, cs.start_time, cs.end_time,
              c.name as course_name, s.name as store_name, co.name as coach_name
       FROM bookings b
       INNER JOIN members m ON b.member_id = m.id
       INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN stores s ON cs.store_id = s.id
       INNER JOIN coaches co ON cs.coach_id = co.id
       ${whereClause}
       ORDER BY cs.start_time ASC, b.created_at ASC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const stats = getOne<any>(
      `SELECT
        SUM(CASE WHEN b.status = 'booked' THEN 1 ELSE 0 END) as booked_count,
        SUM(CASE WHEN b.status = 'checked_in' OR b.status = 'completed' THEN 1 ELSE 0 END) as checked_in_count,
        SUM(CASE WHEN b.status = 'no_show' THEN 1 ELSE 0 END) as no_show_count,
        SUM(CASE WHEN b.status = 'waitlisted' THEN 1 ELSE 0 END) as waitlist_count
       FROM bookings b INNER JOIN coach_schedules cs ON b.schedule_id = cs.id ${whereClause}`,
      params
    );

    return paginated(
      res,
      list.map(item => ({
        id: item.id,
        member: {
          id: item.member_id,
          name: item.member_name,
          phone: item.member_phone,
          avatar: item.member_avatar
        },
        course: {
          scheduleId: item.schedule_id,
          name: item.course_name,
          date: item.date,
          startTime: item.start_time,
          endTime: item.end_time,
          coach: item.coach_name,
          store: item.store_name
        },
        status: item.status,
        isWaitlist: item.is_waitlist === 1,
        waitlistPosition: item.waitlist_position,
        checkInCode: item.check_in_code,
        checkInTime: item.check_in_time,
        canCheckIn: item.status === 'booked'
      })),
      countResult?.total || 0,
      page,
      pageSize,
      `查询成功，预约：${stats?.booked_count || 0} | 已签到：${stats?.checked_in_count || 0} | 爽约：${stats?.no_show_count || 0} | 候补：${stats?.waitlist_count || 0}`
    );
  } catch (err: any) {
    return fail(res, err.message || '获取签到列表失败');
  }
});

router.get('/schedule/:id/stats', async (req: AuthRequest, res: Response) => {
  try {
    const scheduleId = req.params.id;

    const schedule = getOne<any>(
      `SELECT cs.*, c.name as course_name, s.name as store_name FROM coach_schedules cs
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN stores s ON cs.store_id = s.id
       WHERE cs.id = ?`,
      [scheduleId]
    );

    if (!schedule) {
      return fail(res, '排班不存在');
    }

    const bookingStats = getOne<any>(
      `SELECT
        SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) as booked_count,
        SUM(CASE WHEN status IN ('checked_in', 'completed') THEN 1 ELSE 0 END) as checked_in_count,
        SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) as no_show_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
        SUM(CASE WHEN status = 'waitlisted' THEN 1 ELSE 0 END) as waitlist_count
       FROM bookings WHERE schedule_id = ?`,
      [scheduleId]
    );

    const attendanceRate = schedule.booked_count > 0
      ? Math.round(((bookingStats?.checked_in_count || 0) / schedule.booked_count) * 100)
      : 0;

    return success(res, {
      schedule: {
        id: schedule.id,
        date: schedule.date,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        courseName: schedule.course_name,
        storeName: schedule.store_name,
        capacity: schedule.capacity
      },
      stats: {
        capacity: schedule.capacity,
        bookedCount: schedule.booked_count,
        checkInCount: bookingStats?.checked_in_count || 0,
        noShowCount: bookingStats?.no_show_count || 0,
        cancelledCount: bookingStats?.cancelled_count || 0,
        waitlistCount: bookingStats?.waitlist_count || 0,
        attendanceRate,
        occupancyRate: Math.round((schedule.booked_count / schedule.capacity) * 100)
      }
    });
  } catch (err: any) {
    return fail(res, err.message || '获取签到统计失败');
  }
});

export default router;
