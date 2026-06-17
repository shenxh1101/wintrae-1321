import { Router, Response } from 'express';
import dayjs from 'dayjs';
import { AuthRequest } from '../middleware/auth';
import { success, fail } from '../utils/response';
import { getOne, getAll } from '../database';

const router = Router();

router.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    const endDate = req.query.endDate as string || dayjs().format('YYYY-MM-DD');
    const storeId = req.query.storeId as string;

    const scheduleConditions: string[] = [`cs.date >= ? AND cs.date <= ?`];
    const scheduleParams: any[] = [startDate, endDate];

    if (storeId) {
      scheduleConditions.push(`cs.store_id = ?`);
      scheduleParams.push(storeId);
    }

    const scheduleWhere = `WHERE ${scheduleConditions.join(' AND ')}`;

    const scheduleStats = getOne<any>(
      `SELECT
        COUNT(DISTINCT cs.id) as total_classes,
        SUM(cs.capacity) as total_capacity,
        SUM(cs.booked_count) as total_booked,
        SUM(CASE WHEN cs.booked_count >= cs.capacity THEN 1 ELSE 0 END) as full_classes
       FROM coach_schedules cs ${scheduleWhere}`,
      scheduleParams
    );

    let bookingWhere = `WHERE b.created_at >= ? AND b.created_at <= ?`;
    const bookingParams: any[] = [
      dayjs(startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'),
      dayjs(endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
    ];

    if (storeId) {
      const storeScheduleIds = getOne<any>(
        `SELECT GROUP_CONCAT(id) as ids FROM coach_schedules WHERE store_id = ?`,
        [storeId]
      );
      if (storeScheduleIds && storeScheduleIds.ids) {
        const ids = storeScheduleIds.ids.split(',');
        const placeholders = ids.map(() => '?').join(',');
        bookingWhere += ` AND b.schedule_id IN (${placeholders})`;
        bookingParams.push(...ids);
      } else {
        bookingWhere += ` AND 1 = 0`;
      }
    }

    const bookingStats = getOne<any>(
      `SELECT
        SUM(CASE WHEN b.status IN ('booked', 'checked_in', 'completed', 'waitlisted') THEN 1 ELSE 0 END) as total_bookings,
        SUM(CASE WHEN b.status IN ('checked_in', 'completed') THEN 1 ELSE 0 END) as total_checkins,
        SUM(CASE WHEN b.status = 'no_show' THEN 1 ELSE 0 END) as total_no_shows,
        SUM(CASE WHEN b.status = 'cancelled' THEN 1 ELSE 0 END) as total_cancelled,
        SUM(CASE WHEN b.status = 'waitlisted' THEN 1 ELSE 0 END) as total_waitlisted
       FROM bookings b ${bookingWhere}`,
      bookingParams
    );

    let reviewWhere = `WHERE r.created_at >= ? AND r.created_at <= ?`;
    const reviewParams: any[] = [
      dayjs(startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'),
      dayjs(endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
    ];

    if (storeId) {
      reviewWhere += ` AND EXISTS (
        SELECT 1 FROM coach_schedules cs
        WHERE cs.id = r.schedule_id AND cs.store_id = ?
      )`;
      reviewParams.push(storeId);
    }

    const reviewStats = getOne<any>(
      `SELECT
        COUNT(*) as total_reviews,
        AVG(r.rating) as avg_rating,
        SUM(CASE WHEN r.rating >= 4 THEN 1 ELSE 0 END) as good_reviews
       FROM reviews r ${reviewWhere}`,
      reviewParams
    );

    const memberStats = getOne<any>(
      `SELECT
        COUNT(*) as total_members,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_members,
        SUM(points) as total_points
       FROM members`
    );

    const totalBookings = bookingStats?.total_bookings || 0;
    const totalCheckins = bookingStats?.total_checkins || 0;
    const totalCapacity = scheduleStats?.total_capacity || 0;
    const totalBooked = scheduleStats?.total_booked || 0;

    return success(res, {
      period: { startDate, endDate },
      members: {
        total: memberStats?.total_members || 0,
        active: memberStats?.active_members || 0,
        totalPoints: memberStats?.total_points || 0
      },
      schedules: {
        totalClasses: scheduleStats?.total_classes || 0,
        fullClasses: scheduleStats?.full_classes || 0,
        fullRate: scheduleStats?.total_classes > 0
          ? Math.round((scheduleStats?.full_classes / scheduleStats?.total_classes) * 100)
          : 0
      },
      bookings: {
        total: totalBookings,
        checkIns: totalCheckins,
        noShows: bookingStats?.total_no_shows || 0,
        cancelled: bookingStats?.total_cancelled || 0,
        waitlisted: bookingStats?.total_waitlisted || 0
      },
      rates: {
        occupancyRate: totalCapacity > 0 ? Math.round((totalBooked / totalCapacity) * 100) : 0,
        attendanceRate: totalBookings > 0 ? Math.round((totalCheckins / totalBookings) * 100) : 0,
        noShowRate: totalBookings > 0 ? Math.round(((bookingStats?.total_no_shows || 0) / totalBookings) * 100) : 0
      },
      reviews: {
        total: reviewStats?.total_reviews || 0,
        avgRating: Math.round((reviewStats?.avg_rating || 0) * 10) / 10,
        goodRate: reviewStats?.total_reviews > 0
          ? Math.round((reviewStats?.good_reviews / reviewStats?.total_reviews) * 100)
          : 0
      }
    });
  } catch (err: any) {
    return fail(res, err.message || '获取总览数据失败');
  }
});

router.get('/occupancy/daily', async (req: AuthRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    const endDate = req.query.endDate as string || dayjs().format('YYYY-MM-DD');
    const storeId = req.query.storeId as string;
    const courseType = req.query.courseType as string;

    const conditions: string[] = [`cs.date >= ? AND cs.date <= ?`];
    const params: any[] = [startDate, endDate];

    if (storeId) {
      conditions.push(`cs.store_id = ?`);
      params.push(storeId);
    }

    let joinClause = '';
    if (courseType) {
      joinClause = `INNER JOIN courses c ON cs.course_id = c.id`;
      conditions.push(`c.type = ?`);
      params.push(courseType);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const dailyStats = await getAll<any>(
      `SELECT
        cs.date as date,
        COUNT(DISTINCT cs.id) as class_count,
        SUM(cs.capacity) as total_capacity,
        SUM(cs.booked_count) as total_booked,
        SUM(CASE WHEN cs.booked_count >= cs.capacity THEN 1 ELSE 0 END) as full_count
       FROM coach_schedules cs
       ${joinClause}
       ${whereClause}
       GROUP BY cs.date
       ORDER BY cs.date ASC`,
      params
    );

    return success(res, {
      period: { startDate, endDate },
      list: dailyStats.map(item => ({
        date: item.date,
        classCount: item.class_count,
        totalCapacity: item.total_capacity,
        bookedCount: item.total_booked,
        fullCount: item.full_count,
        occupancyRate: item.total_capacity > 0
          ? Math.round((item.total_booked / item.total_capacity) * 100)
          : 0,
        fullRate: item.class_count > 0
          ? Math.round((item.full_count / item.class_count) * 100)
          : 0
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取满座率数据失败');
  }
});

router.get('/attendance/daily', async (req: AuthRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    const endDate = req.query.endDate as string || dayjs().format('YYYY-MM-DD');
    const storeId = req.query.storeId as string;

    const conditions: string[] = [`cs.date >= ? AND cs.date <= ?`];
    const params: any[] = [startDate, endDate];

    if (storeId) {
      conditions.push(`cs.store_id = ?`);
      params.push(storeId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const dailyStats = await getAll<any>(
      `SELECT
        cs.date as date,
        COUNT(DISTINCT cs.id) as class_count,
        SUM(CASE WHEN b.status IN ('booked', 'checked_in', 'completed') THEN 1 ELSE 0 END) as total_booked,
        SUM(CASE WHEN b.status IN ('checked_in', 'completed') THEN 1 ELSE 0 END) as total_checkedin,
        SUM(CASE WHEN b.status = 'no_show' THEN 1 ELSE 0 END) as total_no_show
       FROM coach_schedules cs
       LEFT JOIN bookings b ON cs.id = b.schedule_id
       ${whereClause}
       GROUP BY cs.date
       ORDER BY cs.date ASC`,
      params
    );

    return success(res, {
      period: { startDate, endDate },
      list: dailyStats.map(item => ({
        date: item.date,
        classCount: item.class_count,
        bookedCount: item.total_booked,
        checkedInCount: item.total_checkedin,
        noShowCount: item.total_no_show,
        attendanceRate: item.total_booked > 0
          ? Math.round((item.total_checkedin / item.total_booked) * 100)
          : 0,
        noShowRate: item.total_booked > 0
          ? Math.round((item.total_no_show / item.total_booked) * 100)
          : 0
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取出勤率数据失败');
  }
});

router.get('/courses/ranking', async (req: AuthRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    const endDate = req.query.endDate as string || dayjs().format('YYYY-MM-DD');
    const storeId = req.query.storeId as string;
    const limit = parseInt(req.query.limit as string) || 10;

    const conditions: string[] = [`cs.date >= ? AND cs.date <= ?`];
    const params: any[] = [startDate, endDate];

    if (storeId) {
      conditions.push(`cs.store_id = ?`);
      params.push(storeId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const courseRanking = await getAll<any>(
      `SELECT
        c.id as course_id,
        c.name as course_name,
        c.type as course_type,
        COUNT(DISTINCT cs.id) as class_count,
        SUM(cs.capacity) as total_capacity,
        SUM(cs.booked_count) as total_booked,
        ROUND(AVG(CASE WHEN cs.capacity > 0 THEN cs.booked_count * 100.0 / cs.capacity ELSE 0 END), 1) as avg_occupancy_rate,
        SUM(CASE WHEN b.status IN ('checked_in', 'completed') THEN 1 ELSE 0 END) as total_checkins,
        AVG(r.rating) as avg_rating
       FROM courses c
       INNER JOIN coach_schedules cs ON c.id = cs.course_id
       LEFT JOIN bookings b ON cs.id = b.schedule_id
       LEFT JOIN reviews r ON cs.id = r.schedule_id
       ${whereClause}
       GROUP BY c.id
       ORDER BY total_booked DESC
       LIMIT ?`,
      [...params, limit]
    );

    return success(res, {
      period: { startDate, endDate },
      ranking: courseRanking.map((item, index) => ({
        rank: index + 1,
        course: {
          id: item.course_id,
          name: item.course_name,
          type: item.course_type
        },
        stats: {
          classCount: item.class_count,
          totalBooked: item.total_booked,
          avgOccupancyRate: item.avg_occupancy_rate || 0,
          totalCheckIns: item.total_checkins || 0,
          avgRating: Math.round((item.avg_rating || 0) * 10) / 10
        }
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取课程排行失败');
  }
});

router.get('/coaches/ranking', async (req: AuthRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    const endDate = req.query.endDate as string || dayjs().format('YYYY-MM-DD');
    const storeId = req.query.storeId as string;
    const limit = parseInt(req.query.limit as string) || 10;

    const conditions: string[] = [`cs.date >= ? AND cs.date <= ?`];
    const params: any[] = [startDate, endDate];

    if (storeId) {
      conditions.push(`cs.store_id = ?`);
      params.push(storeId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const coachRanking = await getAll<any>(
      `SELECT
        co.id as coach_id,
        co.name as coach_name,
        co.title as coach_title,
        COUNT(DISTINCT cs.id) as class_count,
        SUM(cs.booked_count) as total_booked,
        ROUND(AVG(CASE WHEN cs.capacity > 0 THEN cs.booked_count * 100.0 / cs.capacity ELSE 0 END), 1) as avg_occupancy_rate,
        COUNT(DISTINCT r.id) as review_count,
        AVG(r.rating) as avg_rating
       FROM coaches co
       INNER JOIN coach_schedules cs ON co.id = cs.coach_id
       LEFT JOIN reviews r ON co.id = r.coach_id
       ${whereClause}
       GROUP BY co.id
       ORDER BY avg_rating DESC, total_booked DESC
       LIMIT ?`,
      [...params, limit]
    );

    return success(res, {
      period: { startDate, endDate },
      ranking: coachRanking.map((item, index) => ({
        rank: index + 1,
        coach: {
          id: item.coach_id,
          name: item.coach_name,
          title: item.coach_title
        },
        stats: {
          classCount: item.class_count,
          totalBooked: item.total_booked,
          avgOccupancyRate: item.avg_occupancy_rate || 0,
          reviewCount: item.review_count || 0,
          avgRating: Math.round((item.avg_rating || 0) * 10) / 10
        }
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取教练排行失败');
  }
});

router.get('/stores/summary', async (req: AuthRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    const endDate = req.query.endDate as string || dayjs().format('YYYY-MM-DD');

    const storeStats = await getAll<any>(
      `SELECT
        s.id as store_id,
        s.name as store_name,
        COUNT(DISTINCT cs.id) as class_count,
        SUM(cs.capacity) as total_capacity,
        SUM(cs.booked_count) as total_booked,
        SUM(CASE WHEN b.status IN ('checked_in', 'completed') THEN 1 ELSE 0 END) as total_checkins,
        COUNT(DISTINCT CASE WHEN b.member_id IS NOT NULL THEN b.member_id END) as active_members
       FROM stores s
       LEFT JOIN coach_schedules cs ON s.id = cs.store_id AND cs.date >= ? AND cs.date <= ?
       LEFT JOIN bookings b ON cs.id = b.schedule_id
       GROUP BY s.id
       ORDER BY total_booked DESC`,
      [startDate, endDate]
    );

    return success(res, {
      period: { startDate, endDate },
      stores: storeStats.map(item => ({
        store: {
          id: item.store_id,
          name: item.store_name
        },
        stats: {
          classCount: item.class_count || 0,
          totalCapacity: item.total_capacity || 0,
          totalBooked: item.total_booked || 0,
          totalCheckIns: item.total_checkins || 0,
          activeMembers: item.active_members || 0,
          occupancyRate: item.total_capacity > 0
            ? Math.round((item.total_booked / item.total_capacity) * 100)
            : 0,
          attendanceRate: item.total_booked > 0
            ? Math.round((item.total_checkins / item.total_booked) * 100)
            : 0
        }
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取门店汇总失败');
  }
});

router.get('/reviews/summary', async (req: AuthRequest, res: Response) => {
  try {
    const startDate = req.query.startDate as string || dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    const endDate = req.query.endDate as string || dayjs().format('YYYY-MM-DD');

    const summary = await getOne<any>(
      `SELECT
        COUNT(*) as total_reviews,
        AVG(rating) as avg_rating,
        SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as count_5,
        SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as count_4,
        SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as count_3,
        SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as count_2,
        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as count_1
       FROM reviews
       WHERE created_at >= ? AND created_at <= ?`,
      [
        dayjs(startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'),
        dayjs(endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
      ]
    );

    const recentReviews = await getAll<any>(
      `SELECT r.*, m.name as member_name, c.name as course_name, co.name as coach_name
       FROM reviews r
       INNER JOIN members m ON r.member_id = m.id
       INNER JOIN coach_schedules cs ON r.schedule_id = cs.id
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN coaches co ON r.coach_id = co.id
       WHERE r.created_at >= ? AND r.created_at <= ?
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [
        dayjs(startDate).startOf('day').format('YYYY-MM-DD HH:mm:ss'),
        dayjs(endDate).endOf('day').format('YYYY-MM-DD HH:mm:ss')
      ]
    );

    return success(res, {
      period: { startDate, endDate },
      summary: {
        totalReviews: summary?.total_reviews || 0,
        avgRating: Math.round((summary?.avg_rating || 0) * 10) / 10,
        goodRate: summary?.total_reviews > 0
          ? Math.round(((summary?.count_5 + summary?.count_4) / summary?.total_reviews) * 100)
          : 0,
        distribution: {
          5: summary?.count_5 || 0,
          4: summary?.count_4 || 0,
          3: summary?.count_3 || 0,
          2: summary?.count_2 || 0,
          1: summary?.count_1 || 0
        }
      },
      recentReviews: recentReviews.map(item => ({
        id: item.id,
        rating: item.rating,
        content: item.content,
        createdAt: item.created_at,
        member: { name: item.member_name },
        course: { name: item.course_name },
        coach: { name: item.coach_name }
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取评价汇总失败');
  }
});

export default router;
