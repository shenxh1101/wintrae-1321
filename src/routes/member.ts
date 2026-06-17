import { Router, Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, authMiddleware } from '../middleware/auth';
import { generateToken } from '../middleware/auth';
import { success, fail, paginated } from '../utils/response';
import { getOne, getAll, runSQL } from '../database';
import { parseIntParam } from '../utils/helpers';
import { config } from '../config';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return fail(res, '手机号和密码不能为空');
    }

    const member = getOne<any>(
      `SELECT * FROM members WHERE phone = ?`,
      [phone]
    );

    if (!member) {
      return fail(res, '手机号或密码错误');
    }

    if (member.status !== 'active') {
      return fail(res, '会员状态异常，请联系客服');
    }

    const isValid = bcrypt.compareSync(password, member.password);
    if (!isValid) {
      return fail(res, '手机号或密码错误');
    }

    const token = generateToken(member.id);

    return success(res, {
      token,
      member: {
        id: member.id,
        name: member.name,
        phone: member.phone,
        email: member.email,
        avatar: member.avatar,
        membershipType: member.membership_type,
        membershipStart: member.membership_start,
        membershipEnd: member.membership_end,
        remainingCount: member.remaining_count,
        totalCount: member.total_count,
        points: member.points,
        status: member.status
      }
    }, '登录成功');
  } catch (err: any) {
    return fail(res, err.message || '登录失败');
  }
});

router.get('/profile', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;

    const member = getOne<any>(
      `SELECT * FROM members WHERE id = ?`,
      [memberId]
    );

    if (!member) {
      return fail(res, '会员不存在');
    }

    const startOfWeek = dayjs().startOf('week').format('YYYY-MM-DD HH:mm:ss');
    const endOfWeek = dayjs().endOf('week').format('YYYY-MM-DD HH:mm:ss');

    const weeklyBookingCount = getOne<any>(
      `SELECT COUNT(*) as count FROM bookings WHERE member_id = ? AND status = 'booked' AND created_at >= ? AND created_at <= ?`,
      [memberId, startOfWeek, endOfWeek]
    );

    return success(res, {
      id: member.id,
      name: member.name,
      phone: member.phone,
      email: member.email,
      avatar: member.avatar,
      membershipType: member.membership_type,
      membershipStart: member.membership_start,
      membershipEnd: member.membership_end,
      remainingCount: member.remaining_count,
      totalCount: member.total_count,
      usedCount: member.total_count - member.remaining_count,
      points: member.points,
      status: member.status,
      createdAt: member.created_at,
      bookingRules: {
        maxBookingsPerWeek: config.maxBookingsPerWeek,
        weeklyBookedCount: weeklyBookingCount?.count || 0,
        cancelDeadlineHours: config.cancelDeadlineHours,
        checkInWindowMinutes: config.checkInWindowMinutes
      }
    });
  } catch (err: any) {
    return fail(res, err.message || '获取会员信息失败');
  }
});

router.get('/remaining', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;

    const member = getOne<any>(
      `SELECT remaining_count, total_count, membership_type, membership_start, membership_end, points FROM members WHERE id = ?`,
      [memberId]
    );

    if (!member) {
      return fail(res, '会员不存在');
    }

    const activeBookings = getOne<any>(
      `SELECT COUNT(*) as count FROM bookings WHERE member_id = ? AND status IN ('booked', 'waitlisted')`,
      [memberId]
    );

    const todayStart = dayjs().format('YYYY-MM-DD');
    const todayBookings = getOne<any>(
      `SELECT COUNT(*) as count FROM bookings b
       INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
       WHERE b.member_id = ? AND b.status IN ('booked', 'checked_in', 'completed') AND cs.date = ?`,
      [memberId, todayStart]
    );

    return success(res, {
      remainingCount: member.remaining_count,
      totalCount: member.total_count,
      usedCount: member.total_count - member.remaining_count,
      points: member.points,
      activeBookings: activeBookings?.count || 0,
      todayBookings: todayBookings?.count || 0,
      membershipType: member.membership_type,
      membershipStart: member.membership_start,
      membershipEnd: member.membership_end,
      daysRemaining: Math.max(0, dayjs(member.membership_end).diff(dayjs(), 'day'))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取剩余次数失败');
  }
});

router.get('/booking-history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;
    const page = parseIntParam(req.query.page, 1) || 1;
    const pageSize = parseIntParam(req.query.pageSize, 10) || 10;
    const status = req.query.status as string;
    const offset = (page - 1) * pageSize;

    let whereClause = `WHERE b.member_id = ?`;
    const params: any[] = [memberId];

    if (status) {
      whereClause += ` AND b.status = ?`;
      params.push(status);
    }

    const countResult = getOne<any>(
      `SELECT COUNT(*) as total FROM bookings b ${whereClause}`,
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
       ORDER BY cs.date DESC, cs.start_time DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

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

    return paginated(res, formattedList, countResult?.total || 0, page, pageSize);
  } catch (err: any) {
    return fail(res, err.message || '获取预约历史失败');
  }
});

router.get('/points-records', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;
    const page = parseIntParam(req.query.page, 1) || 1;
    const pageSize = parseIntParam(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;

    const countResult = getOne<any>(
      `SELECT COUNT(*) as total FROM points_records WHERE member_id = ?`,
      [memberId]
    );

    const list = getAll<any>(
      `SELECT * FROM points_records WHERE member_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [memberId, pageSize, offset]
    );

    const member = getOne<any>(`SELECT points FROM members WHERE id = ?`, [memberId]);

    return success(res, {
      total: countResult?.total || 0,
      page,
      pageSize,
      currentPoints: member?.points || 0,
      list: list.map(item => ({
        id: item.id,
        change: item.change,
        type: item.type,
        description: item.description,
        relatedBookingId: item.related_booking_id,
        createdAt: item.created_at
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取积分记录失败');
  }
});

router.get('/notifications', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;
    const page = parseIntParam(req.query.page, 1) || 1;
    const pageSize = parseIntParam(req.query.pageSize, 20) || 20;
    const offset = (page - 1) * pageSize;
    const onlyUnread = req.query.onlyUnread === 'true';

    let whereClause = `WHERE member_id = ?`;
    const params: any[] = [memberId];

    if (onlyUnread) {
      whereClause += ` AND is_read = 0`;
    }

    const countResult = getOne<any>(
      `SELECT COUNT(*) as total FROM notifications ${whereClause}`,
      params
    );

    const unreadCount = getOne<any>(
      `SELECT COUNT(*) as count FROM notifications WHERE member_id = ? AND is_read = 0`,
      [memberId]
    );

    const list = getAll<any>(
      `SELECT * FROM notifications ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return success(res, {
      total: countResult?.total || 0,
      page,
      pageSize,
      unreadCount: unreadCount?.count || 0,
      list: list.map(item => ({
        id: item.id,
        type: item.type,
        title: item.title,
        content: item.content,
        isRead: item.is_read === 1,
        createdAt: item.created_at
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取通知列表失败');
  }
});

router.post('/notifications/:id/read', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;
    const notificationId = req.params.id;

    const notification = getOne<any>(
      `SELECT * FROM notifications WHERE id = ? AND member_id = ?`,
      [notificationId, memberId]
    );

    if (!notification) {
      return fail(res, '通知不存在');
    }

    runSQL(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [notificationId]);

    return success(res, null, '标记已读成功');
  } catch (err: any) {
    return fail(res, err.message || '标记已读失败');
  }
});

router.post('/notifications/read-all', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId!;

    runSQL(`UPDATE notifications SET is_read = 1 WHERE member_id = ? AND is_read = 0`, [memberId]);

    return success(res, null, '全部标记已读成功');
  } catch (err: any) {
    return fail(res, err.message || '标记已读失败');
  }
});

export default router;
