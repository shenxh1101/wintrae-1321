import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import * as bcrypt from 'bcryptjs';
import { runSQL, getAll, getOne, transaction } from './index';

function generateDates(days: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < days; i++) {
    dates.push(dayjs().add(i, 'day').format('YYYY-MM-DD'));
  }
  return dates;
}

export function seedData() {
  console.log('开始生成种子数据...');

  transaction(() => {
    runSQL('DELETE FROM notifications');
    runSQL('DELETE FROM points_records');
    runSQL('DELETE FROM reviews');
    runSQL('DELETE FROM bookings');
    runSQL('DELETE FROM coach_schedules');
    runSQL('DELETE FROM coaches');
    runSQL('DELETE FROM courses');
    runSQL('DELETE FROM members');
    runSQL('DELETE FROM stores');
  });

  const stores = [
    { id: uuidv4(), name: '朝阳旗舰店', address: '北京市朝阳区建国路88号SOHO现代城A座', phone: '010-88888801', business_hours: '06:00-23:00', status: 'open' },
    { id: uuidv4(), name: '海淀中关村店', address: '北京市海淀区中关村大街1号', phone: '010-88888802', business_hours: '07:00-22:00', status: 'open' },
    { id: uuidv4(), name: '浦东陆家嘴店', address: '上海市浦东新区陆家嘴环路1000号', phone: '021-66666601', business_hours: '06:00-23:00', status: 'open' },
  ];

  for (const store of stores) {
    runSQL(
      `INSERT INTO stores (id, name, address, phone, business_hours, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [store.id, store.name, store.address, store.phone, store.business_hours, store.status]
    );
  }

  const passwordHash = bcrypt.hashSync('123456', 10);
  const members = [
    {
      id: uuidv4(),
      name: '张三',
      phone: '13800000001',
      email: 'zhangsan@example.com',
      avatar: '',
      password: passwordHash,
      membership_type: 'yearly',
      membership_start: dayjs().format('YYYY-MM-DD'),
      membership_end: dayjs().add(1, 'year').format('YYYY-MM-DD'),
      remaining_count: 100,
      total_count: 100,
      points: 500,
      status: 'active',
      created_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
    },
    {
      id: uuidv4(),
      name: '李四',
      phone: '13800000002',
      email: 'lisi@example.com',
      avatar: '',
      password: passwordHash,
      membership_type: 'monthly',
      membership_start: dayjs().format('YYYY-MM-DD'),
      membership_end: dayjs().add(1, 'month').format('YYYY-MM-DD'),
      remaining_count: 20,
      total_count: 20,
      points: 200,
      status: 'active',
      created_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
    },
    {
      id: uuidv4(),
      name: '王五',
      phone: '13800000003',
      email: 'wangwu@example.com',
      avatar: '',
      password: passwordHash,
      membership_type: 'count',
      membership_start: dayjs().format('YYYY-MM-DD'),
      membership_end: dayjs().add(6, 'month').format('YYYY-MM-DD'),
      remaining_count: 30,
      total_count: 50,
      points: 100,
      status: 'active',
      created_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
    },
    {
      id: uuidv4(),
      name: '赵六',
      phone: '13800000004',
      email: 'zhaoliu@example.com',
      avatar: '',
      password: passwordHash,
      membership_type: 'quarterly',
      membership_start: dayjs().format('YYYY-MM-DD'),
      membership_end: dayjs().add(3, 'month').format('YYYY-MM-DD'),
      remaining_count: 45,
      total_count: 60,
      points: 800,
      status: 'active',
      created_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
    },
  ];

  for (const member of members) {
    runSQL(
      `INSERT INTO members (id, name, phone, email, avatar, password, membership_type, membership_start, membership_end, remaining_count, total_count, points, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [member.id, member.name, member.phone, member.email, member.avatar, member.password, member.membership_type, member.membership_start, member.membership_end, member.remaining_count, member.total_count, member.points, member.status, member.created_at]
    );
  }

  const courses = [
    { id: uuidv4(), name: '哈他瑜伽', description: '适合初学者的基础瑜伽课程，通过体式和呼吸调节身心', type: 'yoga', duration: 60, difficulty: 'beginner', calories: 200, cover_image: '', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
    { id: uuidv4(), name: '流瑜伽', description: '连贯流畅的体式串联，提升心肺功能和身体灵活性', type: 'yoga', duration: 75, difficulty: 'intermediate', calories: 350, cover_image: '', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
    { id: uuidv4(), name: '普拉提核心', description: '专注核心肌群训练，改善体态和身体控制力', type: 'pilates', duration: 50, difficulty: 'beginner', calories: 250, cover_image: '', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
    { id: uuidv4(), name: '力量训练', description: '全身力量训练，使用器械和自由重量增肌塑形', type: 'strength', duration: 60, difficulty: 'intermediate', calories: 400, cover_image: '', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
    { id: uuidv4(), name: 'HIIT高强度间歇', description: '高效燃脂训练，短时间高强度运动配合休息', type: 'cardio', duration: 45, difficulty: 'advanced', calories: 500, cover_image: '', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
    { id: uuidv4(), name: '动感单车', description: '音乐节奏带动的单车训练，超强燃脂效果', type: 'spinning', duration: 45, difficulty: 'intermediate', calories: 450, cover_image: '', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
    { id: uuidv4(), name: '搏击操', description: '融合拳击和有氧动作，释放压力燃脂塑形', type: 'boxing', duration: 60, difficulty: 'intermediate', calories: 480, cover_image: '', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
    { id: uuidv4(), name: '尊巴舞', description: '拉丁风格的舞蹈健身，快乐燃脂无压力', type: 'dance', duration: 60, difficulty: 'beginner', calories: 380, cover_image: '', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
  ];

  for (const course of courses) {
    runSQL(
      `INSERT INTO courses (id, name, description, type, duration, difficulty, calories, cover_image, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [course.id, course.name, course.description, course.type, course.duration, course.difficulty, course.calories, course.cover_image, course.created_at]
    );
  }

  const coaches = [
    { id: uuidv4(), name: '李教练', avatar: '', title: '资深瑜伽导师', specialties: 'yoga,pilates', introduction: '10年瑜伽教学经验，印度瑜伽学院认证，擅长哈他瑜伽和流瑜伽', rating: 4.9, experience_years: 10, status: 'active', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
    { id: uuidv4(), name: '王教练', avatar: '', title: '力量训练专家', specialties: 'strength,boxing', introduction: '国家健身教练认证，前国家队体能教练，专长增肌减脂', rating: 4.8, experience_years: 8, status: 'active', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
    { id: uuidv4(), name: '陈教练', avatar: '', title: '有氧燃脂教练', specialties: 'cardio,spinning,dance', introduction: '莱美认证教练，擅长HIIT、动感单车和尊巴等有氧课程', rating: 4.7, experience_years: 6, status: 'active', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
    { id: uuidv4(), name: '张教练', avatar: '', title: '普拉提导师', specialties: 'pilates,yoga', introduction: '国际普拉提认证，专注女性塑形和产后恢复训练', rating: 4.9, experience_years: 7, status: 'active', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
    { id: uuidv4(), name: '刘教练', avatar: '', title: '搏击教练', specialties: 'boxing,cardio,strength', introduction: '前职业拳击手，国家一级运动员，搏击操和格斗健身专家', rating: 4.8, experience_years: 12, status: 'active', created_at: dayjs().format('YYYY-MM-DD HH:mm:ss') },
  ];

  for (const coach of coaches) {
    runSQL(
      `INSERT INTO coaches (id, name, avatar, title, specialties, introduction, rating, experience_years, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [coach.id, coach.name, coach.avatar, coach.title, coach.specialties, coach.introduction, coach.rating, coach.experience_years, coach.status, coach.created_at]
    );
  }

  const storeList = getAll<any>('SELECT id FROM stores');
  const courseList = getAll<any>('SELECT id, type FROM courses');
  const coachList = getAll<any>('SELECT id, specialties FROM coaches');

  const timeSlots = [
    { start: '07:00', end: '08:00' },
    { start: '09:30', end: '10:30' },
    { start: '11:00', end: '12:00' },
    { start: '14:00', end: '15:00' },
    { start: '16:30', end: '17:30' },
    { start: '18:30', end: '19:30' },
    { start: '20:00', end: '21:00' },
  ];

  const dates = generateDates(14);
  const capacities = [15, 20, 25, 30];

  for (const date of dates) {
    for (const store of storeList) {
      const scheduleCount = 3 + Math.floor(Math.random() * 3);
      const usedSlots: string[] = [];

      for (let i = 0; i < scheduleCount; i++) {
        let slot, coach, course;
        let attempts = 0;

        do {
          slot = timeSlots[Math.floor(Math.random() * timeSlots.length)];
          coach = coachList[Math.floor(Math.random() * coachList.length)];
          attempts++;
        } while (usedSlots.includes(`${coach.id}-${date}-${slot.start}`) && attempts < 20);

        const slotKey = `${coach.id}-${date}-${slot.start}`;
        usedSlots.push(slotKey);

        const coachTypes = coach.specialties.split(',');
        const matchingCourses = courseList.filter(c => coachTypes.includes(c.type));
        if (matchingCourses.length === 0) continue;
        
        course = matchingCourses[Math.floor(Math.random() * matchingCourses.length)];
        const capacity = capacities[Math.floor(Math.random() * capacities.length)];
        const bookedCount = Math.floor(Math.random() * Math.min(capacity + 3, capacity + 5));
        const waitlistCount = Math.max(0, bookedCount - capacity);
        const actualBooked = Math.min(bookedCount, capacity);

        const scheduleId = uuidv4();
        runSQL(
          `INSERT INTO coach_schedules (id, coach_id, course_id, store_id, date, start_time, end_time, capacity, booked_count, waitlist_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?)`,
          [scheduleId, coach.id, course.id, store.id, date, slot.start, slot.end, capacity, actualBooked, waitlistCount, dayjs().format('YYYY-MM-DD HH:mm:ss')]
        );
      }
    }
  }

  console.log('种子数据生成完成！');
  console.log('默认会员账号（密码均为 123456）:');
  console.log('  张三 - 13800000001');
  console.log('  李四 - 13800000002');
  console.log('  王五 - 13800000003');
  console.log('  赵六 - 13800000004');
}

if (require.main === module) {
  try {
    seedData();
    console.log('数据初始化完成');
    process.exit(0);
  } catch (err) {
    console.error('初始化失败:', err);
    process.exit(1);
  }
}
