import { Router, Response } from 'express';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { success, fail } from '../utils/response';
import { getOne, getAll, runSQL, transaction } from '../database';
import { generateCheckInCode, updateWaitlistPositions, processWaitlistPromotion, createNotification, parseIntParam } from '../utils/helpers';
import { config } from '../config';

const router = Router();

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;
    const { scheduleId } = req.body;

    if (!scheduleId) {
      return fail(res, '排班ID不能为空');
    }

    const member = getOne<any>(
      `SELECT * FROM members WHERE id = ?`,
      [memberId]
    );

    if (!member) {
      return fail(res, '会员不存在');
    }

    if (member.status !== 'active') {
      return fail(res, '会员状态异常，无法预约');
    }

    if (dayjs(member.membership_end).isBefore(dayjs())) {
      return fail(res, '会员已过期，请续费后再预约');
    }

    if (member.remaining_count <= 0) {
      return fail(res, '剩余次数不足，请充值后再预约');
    }

    const schedule = getOne<any>(
      `SELECT cs.*, c.name as course_name, s.name as store_name, co.name as coach_name
       FROM coach_schedules cs
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN stores s ON cs.store_id = s.id
       INNER JOIN coaches co ON cs.coach_id = co.id
       WHERE cs.id = ?`,
      [scheduleId]
    );

    if (!schedule) {
      return fail(res, '排班不存在');
    }

    if (schedule.status !== 'scheduled') {
      return fail(res, '该课程状态异常，无法预约');
    }

    const scheduleDateTime = dayjs(`${schedule.date} ${schedule.start_time}`);
    if (scheduleDateTime.isBefore(dayjs())) {
      return fail(res, '该课程已开始，无法预约');
    }

    const existingBooking = getOne<any>(
      `SELECT * FROM bookings WHERE member_id = ? AND schedule_id = ? AND status IN ('booked', 'waitlisted')`,
      [memberId, scheduleId]
    );

    if (existingBooking) {
      return fail(res, '您已预约该课程，请勿重复预约');
    }

    const sameTimeBookings = getOne<any>(
      `SELECT COUNT(*) as count FROM bookings b
       INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
       WHERE b.member_id = ? AND b.status IN ('booked', 'waitlisted') 
         AND cs.date = ? AND cs.start_time = ? AND cs.id != ?`,
      [memberId, schedule.date, schedule.start_time, scheduleId]
    );

    if (sameTimeBookings && sameTimeBookings.count > 0) {
      return fail(res, '您已预约同时段其他课程');
    }

    const startOfWeek = dayjs().startOf('week').format('YYYY-MM-DD HH:mm:ss');
    const endOfWeek = dayjs().endOf('week').format('YYYY-MM-DD HH:mm:ss');
    const weeklyBookingCount = getOne<any>(
      `SELECT COUNT(*) as count FROM bookings WHERE member_id = ? AND status = 'booked' AND created_at >= ? AND created_at <= ?`,
      [memberId, startOfWeek, endOfWeek]
    );

    if ((weeklyBookingCount?.count || 0) >= config.maxBookingsPerWeek) {
      return fail(res, `每周最多预约 ${config.maxBookingsPerWeek} 节课，您已达到上限`);
    }

    const isFull = schedule.booked_count >= schedule.capacity;
    const bookingId = uuidv4();
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
    let waitlistPosition = 0;
    let checkInCode = '';
    let bookingStatus: 'booked' | 'waitlisted' = 'booked';

    transaction(() => {
      if (isFull) {
        const waitlistCount = getOne<any>(
          `SELECT COUNT(*) as count FROM bookings WHERE schedule_id = ? AND is_waitlist = 1 AND status = 'waitlisted'`,
          [scheduleId]
        );

        waitlistPosition = (waitlistCount?.count || 0) + 1;
        bookingStatus = 'waitlisted';

        runSQL(
          `INSERT INTO bookings (id, member_id, schedule_id, status, check_in_code, check_in_time, is_waitlist, waitlist_position, points_change, created_at, cancelled_at, cancel_reason) VALUES (?, ?, ?, 'waitlisted', NULL, NULL, 1, ?, 0, ?, NULL, NULL)`,
          [bookingId, memberId, scheduleId, waitlistPosition, now]
        );

        runSQL(
          `UPDATE coach_schedules SET waitlist_count = waitlist_count + 1 WHERE id = ?`,
          [scheduleId]
        );
      } else {
        checkInCode = generateCheckInCode();
        bookingStatus = 'booked';

        runSQL(
          `INSERT INTO bookings (id, member_id, schedule_id, status, check_in_code, check_in_time, is_waitlist, waitlist_position, points_change, created_at, cancelled_at, cancel_reason) VALUES (?, ?, ?, 'booked', ?, NULL, 0, NULL, 0, ?, NULL, NULL)`,
          [bookingId, memberId, scheduleId, checkInCode, now]
        );

        runSQL(
          `UPDATE coach_schedules SET booked_count = booked_count + 1 WHERE id = ?`,
          [scheduleId]
        );

        runSQL(
          `UPDATE members SET remaining_count = remaining_count - 1 WHERE id = ?`,
          [memberId]
        );
      }
    });

    if (isFull) {
      createNotification(
        memberId,
        'waitlist',
        '候补预约成功',
        `您已成功加入${schedule.date} ${schedule.start_time} ${schedule.course_name}的候补队列，当前候补第${waitlistPosition}位。如有名额释放将自动为您转正。`
      );

      return success(res, {
        bookingId,
        status: 'waitlisted',
        waitlistPosition,
        message: '课程已满，您已加入候补队列'
      }, '候补成功');
    } else {
      createNotification(
        memberId,
        'booking',
        '预约成功通知',
        `您已成功预约${schedule.date} ${schedule.start_time} ${schedule.course_name}（${schedule.coach_name}教练 - ${schedule.store_name}），请准时到店签到。签到码：${checkInCode}`
      );

      return success(res, {
        bookingId,
        status: 'booked',
        checkInCode,
        message: '预约成功'
      }, '预约成功');
    }
  } catch (err: any) {
    return fail(res, err.message || '预约失败');
  }
});

router.post('/:id/cancel', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;
    const bookingId = req.params.id;
    const { reason } = req.body;

    const booking = getOne<any>(
      `SELECT b.*, cs.date, cs.start_time, cs.end_time, cs.capacity, cs.booked_count as current_booked,
              c.name as course_name, s.name as store_name, co.name as coach_name
       FROM bookings b
       INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN stores s ON cs.store_id = s.id
       INNER JOIN coaches co ON cs.coach_id = co.id
       WHERE b.id = ? AND b.member_id = ?`,
      [bookingId, memberId]
    );

    if (!booking) {
      return fail(res, '预约记录不存在');
    }

    if (booking.status === 'cancelled' || booking.status === 'no_show') {
      return fail(res, '该预约已取消，无法重复操作');
    }

    if (booking.status !== 'booked' && booking.status !== 'waitlisted') {
      return fail(res, '当前状态无法取消');
    }

    const scheduleDateTime = dayjs(`${booking.date} ${booking.start_time}`);
    const minutesBeforeStart = scheduleDateTime.diff(dayjs(), 'minute');
    const hoursBeforeStart = minutesBeforeStart / 60;

    if (booking.status === 'booked' && hoursBeforeStart < config.cancelDeadlineHours) {
      return fail(res, `开课前${config.cancelDeadlineHours}小时内无法取消预约（距离开课仅剩${Math.max(0, Math.round(minutesBeforeStart))}分钟）`);
    }

    const scheduleId = booking.schedule_id;
    const wasWaitlisted = booking.is_waitlist === 1;
    const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
    let promotedMember: any = null;

    transaction(() => {
      runSQL(
        `UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_reason = ? WHERE id = ?`,
        [now, reason || '会员自行取消', bookingId]
      );

      if (wasWaitlisted) {
        runSQL(
          `UPDATE coach_schedules SET waitlist_count = MAX(0, waitlist_count - 1) WHERE id = ?`,
          [scheduleId]
        );
        updateWaitlistPositions(scheduleId);
      } else {
        runSQL(
          `UPDATE coach_schedules SET booked_count = MAX(0, booked_count - 1) WHERE id = ?`,
          [scheduleId]
        );

        runSQL(
          `UPDATE members SET remaining_count = remaining_count + 1 WHERE id = ?`,
          [memberId]
        );

        const promoted = processWaitlistPromotion(scheduleId, 1);
        if (promoted > 0) {
          const updatedSchedule = getOne<any>(
            `SELECT cs.booked_count, cs.waitlist_count FROM coach_schedules cs WHERE cs.id = ?`,
            [scheduleId]
          );
          promotedMember = {
            bookedCount: updatedSchedule?.booked_count || 0,
            waitlistCount: updatedSchedule?.waitlist_count || 0
          };
        }
      }
    });

    createNotification(
      memberId,
      'booking',
      '预约取消通知',
      `您已成功取消${booking.date} ${booking.start_time} ${booking.course_name}（${booking.coach_name}教练 - ${booking.store_name}）的预约${wasWaitlisted ? '（候补）' : ''}。${wasWaitlisted ? '' : '剩余次数已返还至您的账户。'}`
    );

    return success(res, {
      bookingId,
      status: 'cancelled',
      wasWaitlisted,
      remainingCountReturned: wasWaitlisted ? 0 : 1,
      waitlistPromoted: promotedMember ? 1 : 0,
      message: wasWaitlisted ? '候补取消成功' : '取消成功，次数已返还'
    }, '取消成功');
  } catch (err: any) {
    return fail(res, err.message || '取消失败');
  }
});

router.get('/my', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;
    const status = req.query.status as string;
    const page = parseIntParam(req.query.page, 1) || 1;
    const pageSize = parseIntParam(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [`b.member_id = ?`];
    const params: any[] = [memberId];

    if (status) {
      if (status === 'upcoming') {
        conditions.push(`b.status IN ('booked', 'waitlisted') AND cs.date >= date('now')`);
      } else if (status === 'completed') {
        conditions.push(`b.status IN ('checked_in', 'completed')`);
      } else if (status === 'cancelled') {
        conditions.push(`b.status IN ('cancelled', 'no_show')`);
      } else {
        conditions.push(`b.status = ?`);
        params.push(status);
      }
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const orderClause = status === 'upcoming'
      ? `ORDER BY cs.date ASC, cs.start_time ASC`
      : `ORDER BY cs.date DESC, cs.start_time DESC`;

    const countResult = getOne<any>(
      `SELECT COUNT(*) as total FROM bookings b INNER JOIN coach_schedules cs ON b.schedule_id = cs.id ${whereClause}`,
      params
    );

    const list = getAll<any>(
      `SELECT b.*, cs.date, cs.start_time, cs.end_time, cs.capacity,
              c.name as course_name, c.type as course_type, c.duration, c.difficulty, c.calories,
              co.name as coach_name, co.avatar as coach_avatar, co.title as coach_title,
              s.name as store_name, s.address as store_address
       FROM bookings b
       INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN coaches co ON cs.coach_id = co.id
       INNER JOIN stores s ON cs.store_id = s.id
       ${whereClause}
       ${orderClause}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    const upcomingCount = getOne<any>(
      `SELECT COUNT(*) as count FROM bookings b INNER JOIN coach_schedules cs ON b.schedule_id = cs.id WHERE b.member_id = ? AND b.status IN ('booked', 'waitlisted') AND cs.date >= date('now')`,
      [memberId]
    );

    const waitlistMe = list.filter(b => b.is_waitlist === 1 && b.status === 'waitlisted').map(b => b.schedule_id);

    const formattedList = list.map(item => ({
      id: item.id,
      scheduleId: item.schedule_id,
      status: item.status,
      isWaitlist: item.is_waitlist === 1,
      waitlistPosition: item.waitlist_position,
      checkInCode: item.check_in_code,
      checkInTime: item.check_in_time,
      pointsChange: item.points_change,
      createdAt: item.created_at,
      cancelledAt: item.cancelled_at,
      cancelReason: item.cancel_reason,
      canCancel: item.status === 'booked' &&
        dayjs(`${item.date} ${item.start_time}`).diff(dayjs(), 'hour') >= config.cancelDeadlineHours,
      canReview: item.status === 'checked_in' || item.status === 'completed',
      course: {
        name: item.course_name,
        type: item.course_type,
        duration: item.duration,
        difficulty: item.difficulty,
        calories: item.calories
      },
      coach: {
        name: item.coach_name,
        avatar: item.coach_avatar,
        title: item.coach_title
      },
      store: {
        name: item.store_name,
        address: item.store_address
      },
      schedule: {
        date: item.date,
        startTime: item.start_time,
        endTime: item.end_time
      }
    }));

    return success(res, {
      total: countResult?.total || 0,
      page,
      pageSize,
      upcomingCount: upcomingCount?.count || 0,
      list: formattedList
    });
  } catch (err: any) {
    return fail(res, err.message || '获取预约列表失败');
  }
});

router.get('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;
    const bookingId = req.params.id;

    const booking = getOne<any>(
      `SELECT b.*, cs.date, cs.start_time, cs.end_time, cs.capacity, cs.booked_count as schedule_booked,
              c.id as course_id, c.name as course_name, c.type as course_type, c.duration, c.difficulty, c.calories, c.description as course_description,
              co.id as coach_id, co.name as coach_name, co.avatar as coach_avatar, co.title as coach_title,
              s.id as store_id, s.name as store_name, s.address as store_address, s.phone as store_phone
       FROM bookings b
       INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN coaches co ON cs.coach_id = co.id
       INNER JOIN stores s ON cs.store_id = s.id
       WHERE b.id = ? AND b.member_id = ?`,
      [bookingId, memberId]
    );

    if (!booking) {
      return fail(res, '预约记录不存在');
    }

    const review = getOne<any>(
      `SELECT * FROM reviews WHERE booking_id = ?`,
      [bookingId]
    );

    const canCancel = booking.status === 'booked' &&
      dayjs(`${booking.date} ${booking.start_time}`).diff(dayjs(), 'hour') >= config.cancelDeadlineHours;
    const canCheckIn = booking.status === 'booked' &&
      dayjs(`${booking.date} ${booking.start_time}`).diff(dayjs(), 'minute') <= config.checkInWindowMinutes &&
      dayjs(`${booking.date} ${booking.start_time}`).add(booking.duration, 'minute').isAfter(dayjs());

    return success(res, {
      id: booking.id,
      scheduleId: booking.schedule_id,
      status: booking.status,
      isWaitlist: booking.is_waitlist === 1,
      waitlistPosition: booking.waitlist_position,
      checkInCode: booking.check_in_code,
      checkInTime: booking.check_in_time,
      pointsChange: booking.points_change,
      createdAt: booking.created_at,
      cancelledAt: booking.cancelled_at,
      cancelReason: booking.cancel_reason,
      canCancel,
      canCheckIn,
      canReview: !review && (booking.status === 'checked_in' || booking.status === 'completed'),
      hasReviewed: !!review,
      review: review ? {
        id: review.id,
        rating: review.rating,
        content: review.content,
        images: review.images ? review.images.split(',') : [],
        createdAt: review.created_at
      } : null,
      course: {
        id: booking.course_id,
        name: booking.course_name,
        type: booking.course_type,
        duration: booking.duration,
        difficulty: booking.difficulty,
        calories: booking.calories,
        description: booking.course_description
      },
      coach: {
        id: booking.coach_id,
        name: booking.coach_name,
        avatar: booking.coach_avatar,
        title: booking.coach_title
      },
      store: {
        id: booking.store_id,
        name: booking.store_name,
        address: booking.store_address,
        phone: booking.store_phone
      },
      schedule: {
        date: booking.date,
        startTime: booking.start_time,
        endTime: booking.end_time,
        capacity: booking.capacity,
        bookedCount: booking.schedule_booked
      }
    });
  } catch (err: any) {
    return fail(res, err.message || '获取预约详情失败');
  }
});

router.delete('/waitlist/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;
    const bookingId = req.params.id;

    const booking = getOne<any>(
      `SELECT * FROM bookings WHERE id = ? AND member_id = ? AND is_waitlist = 1 AND status = 'waitlisted'`,
      [bookingId, memberId]
    );

    if (!booking) {
      return fail(res, '候补预约不存在');
    }

    transaction(() => {
      runSQL(
        `UPDATE bookings SET status = 'cancelled', cancelled_at = ?, cancel_reason = '取消候补' WHERE id = ?`,
        [dayjs().format('YYYY-MM-DD HH:mm:ss'), bookingId]
      );

      runSQL(
        `UPDATE coach_schedules SET waitlist_count = MAX(0, waitlist_count - 1) WHERE id = ?`,
        [booking.schedule_id]
      );

      updateWaitlistPositions(booking.schedule_id);
    });

    return success(res, null, '取消候补成功');
  } catch (err: any) {
    return fail(res, err.message || '取消候补失败');
  }
});

export default router;
