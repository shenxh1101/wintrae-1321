import { Router, Response } from 'express';
import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest, authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { success, fail, paginated } from '../utils/response';
import { getOne, getAll, runSQL, beginTransaction, commit, rollback } from '../database';
import { changePoints, parseIntParam } from '../utils/helpers';

const router = Router();

router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId;
    const { bookingId, rating, content, images } = req.body;

    if (!bookingId) {
      return fail(res, '预约ID不能为空');
    }

    if (!rating || rating < 1 || rating > 5) {
      return fail(res, '请提供1-5分的评分');
    }

    const booking = await getOne<any>(
      `SELECT b.*, cs.coach_id, cs.schedule_id, c.name as course_name, cs.date, cs.start_time
       FROM bookings b
       INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
       INNER JOIN courses c ON cs.course_id = c.id
       WHERE b.id = ? AND b.member_id = ?`,
      [bookingId, memberId]
    );

    if (!booking) {
      return fail(res, '预约记录不存在');
    }

    if (booking.status !== 'checked_in' && booking.status !== 'completed') {
      return fail(res, '请先完成签到后再评价');
    }

    const existingReview = await getOne<any>(
      `SELECT id FROM reviews WHERE booking_id = ?`,
      [bookingId]
    );

    if (existingReview) {
      return fail(res, '您已评价过该课程');
    }

    await beginTransaction();

    try {
      const reviewId = uuidv4();
      const now = dayjs().format('YYYY-MM-DD HH:mm:ss');
      const imagesStr = images && images.length > 0 ? images.join(',') : null;

      await runSQL(
        `INSERT INTO reviews (id, booking_id, member_id, schedule_id, coach_id, rating, content, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [reviewId, bookingId, memberId, booking.schedule_id, booking.coach_id, rating, content || '', imagesStr, now]
      );

      await runSQL(
        `UPDATE bookings SET status = 'completed' WHERE id = ?`,
        [bookingId]
      );

      const coachStats = await getOne<any>(
        `SELECT AVG(rating) as avg_rating FROM reviews WHERE coach_id = ?`,
        [booking.coach_id]
      );

      if (coachStats && coachStats.avg_rating) {
        await runSQL(
          `UPDATE coaches SET rating = ROUND(?, 1) WHERE id = ?`,
          [coachStats.avg_rating, booking.coach_id]
        );
      }

      await commit();

      await changePoints(
        memberId,
        10,
        'review',
        `${booking.date} ${booking.start_time} ${booking.course_name}评价完成，奖励积分`,
        bookingId
      );

      return success(res, {
        reviewId,
        rating,
        pointsEarned: 10
      }, '评价成功');
    } catch (txErr) {
      await rollback();
      throw txErr;
    }
  } catch (err: any) {
    return fail(res, err.message || '评价失败');
  }
});

router.get('/schedule/:scheduleId', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const scheduleId = req.params.scheduleId;
    const page = parseIntParam(req.query.page, 1) || 1;
    const pageSize = parseIntParam(req.query.pageSize, 10) || 10;
    const minRating = parseIntParam(req.query.minRating);
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [`r.schedule_id = ?`];
    const params: any[] = [scheduleId];

    if (minRating !== undefined) {
      conditions.push(`r.rating >= ?`);
      params.push(minRating);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await getOne<any>(
      `SELECT COUNT(*) as total FROM reviews r ${whereClause}`,
      params
    );

    const stats = await getOne<any>(
      `SELECT
        COUNT(*) as total_reviews,
        AVG(rating) as avg_rating,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as five_star,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as four_star,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as three_star,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as two_star,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as one_star
       FROM reviews r WHERE r.schedule_id = ?`,
      [scheduleId]
    );

    const list = await getAll<any>(
      `SELECT r.*, m.name as member_name, m.avatar as member_avatar, c.name as course_name
       FROM reviews r
       INNER JOIN members m ON r.member_id = m.id
       INNER JOIN coach_schedules cs ON r.schedule_id = cs.id
       INNER JOIN courses c ON cs.course_id = c.id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return success(res, {
      total: countResult?.total || 0,
      page,
      pageSize,
      stats: {
        totalReviews: stats?.total_reviews || 0,
        avgRating: Math.round((stats?.avg_rating || 0) * 10) / 10,
        distribution: {
          5: stats?.five_star || 0,
          4: stats?.four_star || 0,
          3: stats?.three_star || 0,
          2: stats?.two_star || 0,
          1: stats?.one_star || 0
        }
      },
      list: list.map(item => ({
        id: item.id,
        rating: item.rating,
        content: item.content,
        images: item.images ? item.images.split(',') : [],
        createdAt: item.created_at,
        member: {
          name: item.member_name,
          avatar: item.member_avatar
        }
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取评价列表失败');
  }
});

router.get('/coach/:coachId', optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const coachId = req.params.coachId;
    const page = parseIntParam(req.query.page, 1) || 1;
    const pageSize = parseIntParam(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;

    const countResult = await getOne<any>(
      `SELECT COUNT(*) as total FROM reviews WHERE coach_id = ?`,
      [coachId]
    );

    const stats = await getOne<any>(
      `SELECT
        COUNT(*) as total_reviews,
        AVG(rating) as avg_rating,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as good_count
       FROM reviews WHERE coach_id = ?`,
      [coachId]
    );

    const list = await getAll<any>(
      `SELECT r.*, m.name as member_name, m.avatar as member_avatar,
              c.name as course_name, cs.date, cs.start_time
       FROM reviews r
       INNER JOIN members m ON r.member_id = m.id
       INNER JOIN coach_schedules cs ON r.schedule_id = cs.id
       INNER JOIN courses c ON cs.course_id = c.id
       WHERE r.coach_id = ?
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [coachId, pageSize, offset]
    );

    return success(res, {
      total: countResult?.total || 0,
      page,
      pageSize,
      stats: {
        totalReviews: stats?.total_reviews || 0,
        avgRating: Math.round((stats?.avg_rating || 0) * 10) / 10,
        goodRate: stats?.total_reviews > 0 ? Math.round((stats?.good_count / stats?.total_reviews) * 100) : 0
      },
      list: list.map(item => ({
        id: item.id,
        rating: item.rating,
        content: item.content,
        images: item.images ? item.images.split(',') : [],
        createdAt: item.created_at,
        member: {
          name: item.member_name,
          avatar: item.member_avatar
        },
        course: {
          name: item.course_name,
          date: item.date,
          startTime: item.start_time
        }
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取教练评价失败');
  }
});

router.get('/my', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId;
    const page = parseIntParam(req.query.page, 1) || 1;
    const pageSize = parseIntParam(req.query.pageSize, 10) || 10;
    const offset = (page - 1) * pageSize;

    const countResult = await getOne<any>(
      `SELECT COUNT(*) as total FROM reviews WHERE member_id = ?`,
      [memberId]
    );

    const list = await getAll<any>(
      `SELECT r.*, c.name as course_name, co.name as coach_name,
              cs.date, cs.start_time, s.name as store_name
       FROM reviews r
       INNER JOIN coach_schedules cs ON r.schedule_id = cs.id
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN coaches co ON cs.coach_id = co.id
       INNER JOIN stores s ON cs.store_id = s.id
       WHERE r.member_id = ?
       ORDER BY r.created_at DESC
       LIMIT ? OFFSET ?`,
      [memberId, pageSize, offset]
    );

    return paginated(
      res,
      list.map(item => ({
        id: item.id,
        rating: item.rating,
        content: item.content,
        images: item.images ? item.images.split(',') : [],
        createdAt: item.created_at,
        course: {
          name: item.course_name,
          date: item.date,
          startTime: item.start_time
        },
        coach: {
          name: item.coach_name
        },
        store: {
          name: item.store_name
        }
      })),
      countResult?.total || 0,
      page,
      pageSize
    );
  } catch (err: any) {
    return fail(res, err.message || '获取我的评价失败');
  }
});

router.get('/pending', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const memberId = req.memberId;

    const list = await getAll<any>(
      `SELECT b.id as booking_id, cs.date, cs.start_time, cs.end_time,
              c.name as course_name, c.type as course_type, co.name as coach_name, s.name as store_name
       FROM bookings b
       INNER JOIN coach_schedules cs ON b.schedule_id = cs.id
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN coaches co ON cs.coach_id = co.id
       INNER JOIN stores s ON cs.store_id = s.id
       WHERE b.member_id = ? AND b.status = 'checked_in'
         AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.booking_id = b.id)
       ORDER BY cs.date DESC, cs.start_time DESC
       LIMIT 20`,
      [memberId]
    );

    return success(res, {
      count: list.length,
      list: list.map(item => ({
        bookingId: item.booking_id,
        course: {
          name: item.course_name,
          type: item.course_type
        },
        coach: {
          name: item.coach_name
        },
        store: {
          name: item.store_name
        },
        schedule: {
          date: item.date,
          startTime: item.start_time,
          endTime: item.end_time
        }
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取待评价列表失败');
  }
});

export default router;
