import { Router, Request, Response } from 'express';
import { success, fail, paginated } from '../utils/response';
import { getOne, getAll } from '../database';
import { parseIntParam } from '../utils/helpers';

const router = Router();

router.get('/stores', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;

    let whereClause = '';
    const params: any[] = [];

    if (status) {
      whereClause = `WHERE status = ?`;
      params.push(status);
    }

    const stores = await getAll<any>(
      `SELECT * FROM stores ${whereClause} ORDER BY name ASC`,
      params
    );

    return success(res, stores.map(s => ({
      id: s.id,
      name: s.name,
      address: s.address,
      phone: s.phone,
      businessHours: s.business_hours,
      status: s.status
    })));
  } catch (err: any) {
    return fail(res, err.message || '获取门店列表失败');
  }
});

router.get('/courses', async (req: Request, res: Response) => {
  try {
    const page = parseIntParam(req.query.page, 1) || 1;
    const pageSize = parseIntParam(req.query.pageSize, 20) || 20;
    const type = req.query.type as string;
    const difficulty = req.query.difficulty as string;
    const keyword = req.query.keyword as string;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    if (type) {
      conditions.push(`c.type = ?`);
      params.push(type);
    }

    if (difficulty) {
      conditions.push(`c.difficulty = ?`);
      params.push(difficulty);
    }

    if (keyword) {
      conditions.push(`(c.name LIKE ? OR c.description LIKE ?)`);
      params.push(`%${keyword}%`, `%${keyword}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await getOne<any>(
      `SELECT COUNT(*) as total FROM courses c ${whereClause}`,
      params
    );

    const list = await getAll<any>(
      `SELECT c.* FROM courses c ${whereClause} ORDER BY c.name ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return paginated(
      res,
      list.map(c => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: c.type,
        duration: c.duration,
        difficulty: c.difficulty,
        calories: c.calories,
        coverImage: c.cover_image
      })),
      countResult?.total || 0,
      page,
      pageSize
    );
  } catch (err: any) {
    return fail(res, err.message || '获取课程列表失败');
  }
});

router.get('/courses/:id', async (req: Request, res: Response) => {
  try {
    const courseId = req.params.id;

    const course = await getOne<any>(
      `SELECT * FROM courses WHERE id = ?`,
      [courseId]
    );

    if (!course) {
      return fail(res, '课程不存在', 404, 404);
    }

    const upcomingSchedules = await getAll<any>(
      `SELECT cs.*, co.name as coach_name, co.avatar as coach_avatar, s.name as store_name
       FROM coach_schedules cs
       INNER JOIN coaches co ON cs.coach_id = co.id
       INNER JOIN stores s ON cs.store_id = s.id
       WHERE cs.course_id = ? AND cs.date >= date('now') AND cs.status = 'scheduled'
       ORDER BY cs.date ASC, cs.start_time ASC
       LIMIT 10`,
      [courseId]
    );

    return success(res, {
      id: course.id,
      name: course.name,
      description: course.description,
      type: course.type,
      duration: course.duration,
      difficulty: course.difficulty,
      calories: course.calories,
      coverImage: course.cover_image,
      createdAt: course.created_at,
      upcomingSchedules: upcomingSchedules.map(s => ({
        id: s.id,
        date: s.date,
        startTime: s.start_time,
        endTime: s.end_time,
        capacity: s.capacity,
        bookedCount: s.booked_count,
        waitlistCount: s.waitlist_count,
        availableCount: Math.max(0, s.capacity - s.booked_count),
        coach: {
          name: s.coach_name,
          avatar: s.coach_avatar
        },
        store: {
          name: s.store_name
        }
      }))
    });
  } catch (err: any) {
    return fail(res, err.message || '获取课程详情失败');
  }
});

router.get('/coaches', async (req: Request, res: Response) => {
  try {
    const page = parseIntParam(req.query.page, 1) || 1;
    const pageSize = parseIntParam(req.query.pageSize, 20) || 20;
    const specialty = req.query.specialty as string;
    const status = req.query.status as string || 'active';
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: any[] = [];

    if (status) {
      conditions.push(`status = ?`);
      params.push(status);
    }

    if (specialty) {
      conditions.push(`specialties LIKE ?`);
      params.push(`%${specialty}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await getOne<any>(
      `SELECT COUNT(*) as total FROM coaches ${whereClause}`,
      params
    );

    const list = await getAll<any>(
      `SELECT * FROM coaches ${whereClause} ORDER BY rating DESC, name ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return paginated(
      res,
      list.map(c => ({
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        title: c.title,
        specialties: c.specialties ? c.specialties.split(',') : [],
        introduction: c.introduction,
        rating: c.rating,
        experienceYears: c.experience_years
      })),
      countResult?.total || 0,
      page,
      pageSize
    );
  } catch (err: any) {
    return fail(res, err.message || '获取教练列表失败');
  }
});

router.get('/coaches/:id', async (req: Request, res: Response) => {
  try {
    const coachId = req.params.id;

    const coach = await getOne<any>(
      `SELECT * FROM coaches WHERE id = ?`,
      [coachId]
    );

    if (!coach) {
      return fail(res, '教练不存在', 404, 404);
    }

    const reviewStats = await getOne<any>(
      `SELECT COUNT(*) as total_reviews, AVG(rating) as avg_rating FROM reviews WHERE coach_id = ?`,
      [coachId]
    );

    return success(res, {
      id: coach.id,
      name: coach.name,
      avatar: coach.avatar,
      title: coach.title,
      specialties: coach.specialties ? coach.specialties.split(',') : [],
      introduction: coach.introduction,
      rating: coach.rating,
      experienceYears: coach.experience_years,
      status: coach.status,
      stats: {
        totalReviews: reviewStats?.total_reviews || 0,
        avgRating: Math.round((reviewStats?.avg_rating || coach.rating) * 10) / 10
      }
    });
  } catch (err: any) {
    return fail(res, err.message || '获取教练详情失败');
  }
});

router.get('/schedules', async (req: Request, res: Response) => {
  try {
    const page = parseIntParam(req.query.page, 1) || 1;
    const pageSize = parseIntParam(req.query.pageSize, 20) || 20;
    const date = req.query.date as string;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const storeId = req.query.storeId as string;
    const courseId = req.query.courseId as string;
    const coachId = req.query.coachId as string;
    const courseType = req.query.courseType as string;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [`cs.status = 'scheduled'`];
    const params: any[] = [];

    if (date) {
      conditions.push(`cs.date = ?`);
      params.push(date);
    }

    if (startDate && endDate) {
      conditions.push(`cs.date >= ? AND cs.date <= ?`);
      params.push(startDate, endDate);
    } else if (!date) {
      conditions.push(`cs.date >= date('now')`);
    }

    if (storeId) {
      conditions.push(`cs.store_id = ?`);
      params.push(storeId);
    }

    if (courseId) {
      conditions.push(`cs.course_id = ?`);
      params.push(courseId);
    }

    if (coachId) {
      conditions.push(`cs.coach_id = ?`);
      params.push(coachId);
    }

    if (courseType) {
      conditions.push(`c.type = ?`);
      params.push(courseType);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const countResult = await getOne<any>(
      `SELECT COUNT(DISTINCT cs.id) as total FROM coach_schedules cs
       INNER JOIN courses c ON cs.course_id = c.id
       ${whereClause}`,
      params
    );

    const list = await getAll<any>(
      `SELECT cs.*, c.name as course_name, c.type as course_type, c.duration, c.difficulty, c.calories, c.cover_image,
              co.name as coach_name, co.avatar as coach_avatar, co.title as coach_title,
              s.name as store_name, s.address as store_address, s.phone as store_phone
       FROM coach_schedules cs
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN coaches co ON cs.coach_id = co.id
       INNER JOIN stores s ON cs.store_id = s.id
       ${whereClause}
       ORDER BY cs.date ASC, cs.start_time ASC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    return paginated(
      res,
      list.map(s => ({
        id: s.id,
        date: s.date,
        startTime: s.start_time,
        endTime: s.end_time,
        capacity: s.capacity,
        bookedCount: s.booked_count,
        waitlistCount: s.waitlist_count,
        availableCount: Math.max(0, s.capacity - s.booked_count),
        canBook: s.booked_count < s.capacity || s.waitlist_count < s.capacity,
        course: {
          id: s.course_id,
          name: s.course_name,
          type: s.course_type,
          duration: s.duration,
          difficulty: s.difficulty,
          calories: s.calories,
          coverImage: s.cover_image
        },
        coach: {
          id: s.coach_id,
          name: s.coach_name,
          avatar: s.coach_avatar,
          title: s.coach_title
        },
        store: {
          id: s.store_id,
          name: s.store_name,
          address: s.store_address,
          phone: s.store_phone
        }
      })),
      countResult?.total || 0,
      page,
      pageSize
    );
  } catch (err: any) {
    return fail(res, err.message || '获取课程排班失败');
  }
});

router.get('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const scheduleId = req.params.id;

    const schedule = await getOne<any>(
      `SELECT cs.*, c.name as course_name, c.type as course_type, c.duration, c.difficulty, c.calories, c.cover_image, c.description as course_description,
              co.name as coach_name, co.avatar as coach_avatar, co.title as coach_title, co.introduction as coach_introduction, co.rating as coach_rating,
              s.name as store_name, s.address as store_address, s.phone as store_phone, s.business_hours
       FROM coach_schedules cs
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN coaches co ON cs.coach_id = co.id
       INNER JOIN stores s ON cs.store_id = s.id
       WHERE cs.id = ?`,
      [scheduleId]
    );

    if (!schedule) {
      return fail(res, '排班不存在', 404, 404);
    }

    const waitlistPosition = await getOne<any>(
      `SELECT COUNT(*) as count FROM bookings WHERE schedule_id = ? AND is_waitlist = 1 AND status = 'waitlisted'`,
      [scheduleId]
    );

    return success(res, {
      id: schedule.id,
      date: schedule.date,
      startTime: schedule.start_time,
      endTime: schedule.end_time,
      capacity: schedule.capacity,
      bookedCount: schedule.booked_count,
      waitlistCount: schedule.waitlist_count,
      availableCount: Math.max(0, schedule.capacity - schedule.booked_count),
      canBook: schedule.booked_count < schedule.capacity,
      canWaitlist: schedule.booked_count >= schedule.capacity,
      status: schedule.status,
      course: {
        id: schedule.course_id,
        name: schedule.course_name,
        type: schedule.course_type,
        duration: schedule.duration,
        difficulty: schedule.difficulty,
        calories: schedule.calories,
        coverImage: schedule.cover_image,
        description: schedule.course_description
      },
      coach: {
        id: schedule.coach_id,
        name: schedule.coach_name,
        avatar: schedule.coach_avatar,
        title: schedule.coach_title,
        introduction: schedule.coach_introduction,
        rating: schedule.coach_rating
      },
      store: {
        id: schedule.store_id,
        name: schedule.store_name,
        address: schedule.store_address,
        phone: schedule.store_phone,
        businessHours: schedule.business_hours
      }
    });
  } catch (err: any) {
    return fail(res, err.message || '获取排班详情失败');
  }
});

router.get('/coaches/:id/schedules', async (req: Request, res: Response) => {
  try {
    const coachId = req.params.id;
    const startDate = req.query.startDate as string;
    const endDate = req.query.endDate as string;
    const storeId = req.query.storeId as string;

    const conditions: string[] = [`cs.coach_id = ?`, `cs.status = 'scheduled'`];
    const params: any[] = [coachId];

    if (startDate && endDate) {
      conditions.push(`cs.date >= ? AND cs.date <= ?`);
      params.push(startDate, endDate);
    } else {
      conditions.push(`cs.date >= date('now')`);
      conditions.push(`cs.date <= date('now', '+14 days')`);
    }

    if (storeId) {
      conditions.push(`cs.store_id = ?`);
      params.push(storeId);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const list = await getAll<any>(
      `SELECT cs.*, c.name as course_name, c.type as course_type, s.name as store_name
       FROM coach_schedules cs
       INNER JOIN courses c ON cs.course_id = c.id
       INNER JOIN stores s ON cs.store_id = s.id
       ${whereClause}
       ORDER BY cs.date ASC, cs.start_time ASC`,
      params
    );

    return success(res, list.map(s => ({
      id: s.id,
      date: s.date,
      startTime: s.start_time,
      endTime: s.end_time,
      capacity: s.capacity,
      bookedCount: s.booked_count,
      availableCount: Math.max(0, s.capacity - s.booked_count),
      course: {
        name: s.course_name,
        type: s.course_type
      },
      store: {
        id: s.store_id,
        name: s.store_name
      }
    })));
  } catch (err: any) {
    return fail(res, err.message || '获取教练排班失败');
  }
});

export default router;
