const http = require('http');
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'gym.db'));

function request(method, path, token, data) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : null;
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    };
    const req = http.request(options, res => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve(JSON.parse(buf)); }
        catch (e) { resolve({ code: -1, message: buf }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function login(phone) {
  const r = await request('POST', '/api/member/login', null, { phone, password: '123456' });
  return r.data.token;
}

async function api(method, path, token, data, quiet) {
  try {
    const r = await request(method, path, token, data);
    if (!quiet) console.log(`  ✅ ${method} ${path.split('?')[0]} -> code=${r.code}` + (r.code !== 0 ? ` (${r.message})` : ''));
    return r.data;
  } catch (e) {
    if (!quiet) console.log(`  ❌ ${method} ${path} -> ${e.message}`);
    return null;
  }
}

function setBookingCheckedIn(bookingId) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  db.prepare(`UPDATE bookings SET status = 'checked_in', check_in_time = ? WHERE id = ?`).run(now, bookingId);
  // 同时给会员加签到的5积分
  const b = db.prepare(`SELECT member_id FROM bookings WHERE id = ?`).get(bookingId);
  if (b) {
    db.prepare(`UPDATE members SET points = points + 5 WHERE id = ?`).run(b.member_id);
  }
  console.log(`  💾 数据库标记 booking ${bookingId} 为 checked_in`);
}

function setMemberRemainingCount(memberId, count) {
  db.prepare(`UPDATE members SET remaining_count = ? WHERE id = ?`).run(count, memberId);
  console.log(`  💾 数据库设置会员 ${memberId} 剩余次数 = ${count}`);
}

(async () => {
  console.log('======== 测试 1：签到后评价 → 返回记录+积分 → 重复评价拦截 → 待评价去重 ========\n');
  const zs = await login('13800000001');
  const memberInfo = db.prepare(`SELECT id, remaining_count FROM members WHERE phone = '13800000001'`).get();
  const zsMemberId = memberInfo.id;

  // 拿一个未来的排班
  const schedules = await api('GET', '/api/schedules', null);
  const schedList = schedules.schedules?.list || schedules.schedules || schedules.list || [];
  const sched = schedList.find(s => s.date > '2026-06-18') || schedList[0];
  console.log(`  排班日期 ${sched?.date} ${sched?.startTime || sched?.start_time}`);

  // 先确保张三有剩余次数
  setMemberRemainingCount(zsMemberId, 30);

  // 1) 张三创建预约
  const booking = await api('POST', '/api/booking', zs, { scheduleId: sched.id });
  const bookId = booking?.bookingId || booking?.booking?.id;
  console.log(`  bookingId: ${bookId}`);

  // 2) 数据库直接标记 checked_in（跳过签到窗口限制）
  setBookingCheckedIn(bookId);

  // 3) 查待评价列表（应出现）
  const pending1 = await api('GET', '/api/review/pending', zs);
  const p1 = pending1?.list || [];
  console.log(`  评价前待评价数量: ${pending1?.count ?? p1.length}`);
  if (p1.length) console.log(`     - ${p1[0].course?.name} @ ${p1[0].schedule?.date}`);

  // 4) 提交评价
  console.log('\n  【提交评价】');
  const reviewRes = await api('POST', '/api/review', zs, {
    bookingId: bookId, rating: 5, content: '教练非常专业，课程组织得很棒！', images: []
  });
  if (reviewRes) {
    console.log(`     review ID: ${reviewRes.review?.id}`);
    console.log(`     rating: ${reviewRes.review?.rating}  content: "${reviewRes.review?.content}"`);
    console.log(`     课程: ${reviewRes.review?.course?.name}  教练: ${reviewRes.review?.coach?.name}  门店: ${reviewRes.review?.store?.name}`);
    console.log(`     积分奖励: +${reviewRes.points?.earned} (${reviewRes.points?.description})`);
  }

  // 5) 重复评价（应被拦住）
  console.log('\n  【重复提交评价】');
  const dup = await request('POST', '/api/review', zs, { bookingId: bookId, rating: 4, content: '重复' });
  console.log(`     code=${dup.code}  message="${dup.message}"`);

  // 6) 再查待评价列表（这节课应消失）
  const pending2 = await api('GET', '/api/review/pending', zs);
  const p2 = pending2?.list || [];
  console.log(`\n  评价后待评价数量: ${pending2?.count ?? p2.length}`);

  console.log('\n======== 测试 2：候补转正（队首次数不足→跳过→继续找下一个） ========\n');
  const ls = await login('13800000002');
  const ww = await login('13800000003');
  const zl = await login('13800000004');
  const lsId = db.prepare(`SELECT id FROM members WHERE phone = '13800000002'`).get().id;
  const wwId = db.prepare(`SELECT id FROM members WHERE phone = '13800000003'`).get().id;
  const zlId = db.prepare(`SELECT id FROM members WHERE phone = '13800000004'`).get().id;

  // 找一个容量为2的小课，如果没有就用数据库新建一个
  let small = schedList.find(s => s.capacity <= 3);
  let sid;
  if (!small) {
    sid = 'test-sched-' + Date.now();
    const store = db.prepare(`SELECT id FROM stores LIMIT 1`).get();
    const coach = db.prepare(`SELECT id FROM coaches LIMIT 1`).get();
    const course = db.prepare(`SELECT id FROM courses LIMIT 1`).get();
    db.prepare(`INSERT INTO coach_schedules (id, coach_id, course_id, store_id, date, start_time, end_time, capacity, booked_count, waitlist_count, status, created_at)
      VALUES (?, ?, ?, ?, '2026-06-25', '10:00', '11:00', 2, 0, 0, 'scheduled', datetime('now'))`
    ).run(sid, coach.id, course.id, store.id);
    small = { id: sid, capacity: 2 };
    console.log(`  💾 新建测试排班，容量=2`);
  }
  sid = small.id;
  console.log(`  选用排班: ${sid}  容量=${small.capacity}`);

  // 清理之前的预约，让每人有足够次数
  db.prepare(`DELETE FROM bookings WHERE schedule_id = ? AND member_id IN (?, ?, ?, ?)`).run(sid, zsMemberId, lsId, wwId, zlId);
  db.prepare(`UPDATE members SET remaining_count = 30 WHERE id IN (?, ?, ?, ?)`).run(zsMemberId, lsId, wwId, zlId);
  const orig = db.prepare(`SELECT booked_count, waitlist_count, capacity FROM coach_schedules WHERE id = ?`).get(sid);
  console.log(`  初始: booked=${orig.booked_count}  waitlist=${orig.waitlist_count}  capacity=${orig.capacity}`);

  // 如果 booked_count 满了，先减一些
  if (orig.booked_count >= orig.capacity) {
    db.prepare(`UPDATE coach_schedules SET booked_count = ? WHERE id = ?`).run(0, sid);
  }
  db.prepare(`UPDATE coach_schedules SET waitlist_count = 0 WHERE id = ?`).run(sid);

  // 场景：让张三和李四把位置占满（2个），然后王五和赵六进候补
  // 先设置【李四】的剩余次数为 0（测试候补转正时跳过队首）
  setMemberRemainingCount(lsId, 0);
  setMemberRemainingCount(wwId, 30);
  setMemberRemainingCount(zlId, 30);

  console.log(`\n  占满 ${orig.capacity} 个正式名额 + 候补排队：`);
  const b_z = await api('POST', '/api/booking', zs, { scheduleId: sid }, true);
  const b_l = await api('POST', '/api/booking', ls, { scheduleId: sid }, true);
  const b_w = await api('POST', '/api/booking', ww, { scheduleId: sid }, true);
  const b_zl = await api('POST', '/api/booking', zl, { scheduleId: sid }, true);

  const getBookingInfo = (x) => {
    const status = x?.booking?.status || x?.status;
    if (x?.waitlistPosition) return `候补#${x.waitlistPosition}`;
    if (status === 'waitlisted') return '候补';
    return status;
  };
  console.log(`     张三(次数30): ${getBookingInfo(b_z)}`);
  console.log(`     李四(次数0):  ${getBookingInfo(b_l)}`);
  console.log(`     王五(次数30): ${getBookingInfo(b_w)}`);
  console.log(`     赵六(次数30): ${getBookingInfo(b_zl)}`);

  // 查看候补队列位置（数据库）
  const waiters = db.prepare(`
    SELECT m.name, m.remaining_count, b.waitlist_position
    FROM bookings b INNER JOIN members m ON b.member_id = m.id
    WHERE b.schedule_id = ? AND b.is_waitlist = 1 AND b.status = 'waitlisted'
    ORDER BY b.waitlist_position
  `).all(sid);
  console.log(`\n  候补队列:`);
  waiters.forEach(w => console.log(`     #${w.waitlist_position} ${w.name} (剩余次数=${w.remaining_count})`));

  // 取消张三的正式预约 → 释放1个名额 → 应该跳过李四（次数=0）→ 转正王五
  const zsBookId = b_z?.bookingId || b_z?.booking?.id;
  const booked1 = db.prepare(`SELECT booked_count, waitlist_count FROM coach_schedules WHERE id = ?`).get(sid);
  console.log(`\n  取消前: booked=${booked1.booked_count}  waitlist=${booked1.waitlist_count}`);

  console.log('  【取消张三的正式预约】');
  const cancelRes = await api('POST', `/api/booking/${zsBookId}/cancel`, zs, { reason: '测试候补转正' });
  console.log(`     取消返回: waitlistPromoted=${cancelRes?.waitlistPromoted}`);

  const after = db.prepare(`SELECT booked_count, waitlist_count, capacity FROM coach_schedules WHERE id = ?`).get(sid);
  console.log(`     取消后: booked=${after.booked_count}  waitlist=${after.waitlist_count}  capacity=${after.capacity}`);
  console.assert(after.booked_count <= after.capacity, '❌ booked_count 超过容量！');

  // 查各会员的预约状态
  const states = db.prepare(`
    SELECT m.name, b.status, b.is_waitlist, b.cancel_reason
    FROM bookings b INNER JOIN members m ON b.member_id = m.id
    WHERE b.schedule_id = ? AND b.member_id IN (?, ?, ?, ?)
    ORDER BY m.name
  `).all(sid, zsMemberId, lsId, wwId, zlId);
  console.log(`\n  转正之后各位会员状态:`);
  states.forEach(s => {
    const tag = s.is_waitlist ? '候补' : '正式';
    const reason = s.cancel_reason ? ` (取消原因: ${s.cancel_reason})` : '';
    console.log(`     ${s.name}: ${s.status} [${tag}]${reason}`);
  });

  const notifications = db.prepare(`
    SELECT m.name, n.title, n.content
    FROM notifications n INNER JOIN members m ON n.member_id = m.id
    WHERE n.type = 'waitlist' ORDER BY n.created_at DESC LIMIT 5
  `).all();
  console.log(`\n  候补相关通知:`);
  notifications.forEach(n => console.log(`     ${n.name}: ${n.title} — ${n.content.slice(0, 40)}...`));

  console.log('\n======== 测试 3：运营报表评价汇总（带/不带门店筛选区分明显） ========\n');
  const allRev = await api('GET', '/api/report/reviews/summary', zs);
  console.log('  【全部门店】:');
  console.log(`     范围: ${allRev?.filter?.scope}`);
  console.log(`     总评价: ${allRev?.summary?.totalReviews}  均分: ${allRev?.summary?.avgRating}  好评率: ${allRev?.summary?.goodRate}%`);
  console.log(`     分布: 5★=${allRev?.summary?.distribution?.[5]}  4★=${allRev?.summary?.distribution?.[4]}  3★=${allRev?.summary?.distribution?.[3]}  2★=${allRev?.summary?.distribution?.[2]}  1★=${allRev?.summary?.distribution?.[1]}`);
  console.log(`     最近评价: ${allRev?.recentReviews?.length} 条`);
  if (allRev?.recentReviews?.length) {
    allRev.recentReviews.slice(0, 3).forEach(r => console.log(`       · ${r.member?.name} 评了 ${r.course?.name} ${r.rating}★ (门店:${r.store?.name})`));
  }

  const storeId = 'db80eb05-1c87-4406-9296-92b261a6ed69';
  const cyRev = await api('GET', `/api/report/reviews/summary?storeId=${storeId}`, zs);
  console.log('\n  【朝阳旗舰店】:');
  console.log(`     范围: ${cyRev?.filter?.scope}`);
  console.log(`     门店: ${cyRev?.filter?.store?.name} — ${cyRev?.filter?.store?.address}`);
  console.log(`     总评价: ${cyRev?.summary?.totalReviews}  均分: ${cyRev?.summary?.avgRating}  好评率: ${cyRev?.summary?.goodRate}%`);
  console.log(`     分布: 5★=${cyRev?.summary?.distribution?.[5]}  4★=${cyRev?.summary?.distribution?.[4]}  3★=${cyRev?.summary?.distribution?.[3]}  2★=${cyRev?.summary?.distribution?.[2]}  1★=${cyRev?.summary?.distribution?.[1]}`);
  console.log(`     最近评价: ${cyRev?.recentReviews?.length} 条`);
  if (cyRev?.recentReviews?.length) {
    cyRev.recentReviews.slice(0, 3).forEach(r => console.log(`       · ${r.member?.name} 评了 ${r.course?.name} ${r.rating}★ (门店:${r.store?.name})`));
  }

  // 明显区分对比
  console.log('\n  【对比差异】');
  console.log(`     全部门店 reviews 数 vs 朝阳旗舰店 reviews 数: ${allRev?.summary?.totalReviews} vs ${cyRev?.summary?.totalReviews}`);
  console.log(`     all.store is null ? ${allRev?.filter?.store === null}  cy.store.name = "${cyRev?.filter?.store?.name}"`);
  console.log(`     ✅ 两个结果 scope 不同: "${allRev?.filter?.scope}" vs "${cyRev?.filter?.scope}"`);

  console.log('\n======== 全部测试完成 ========');
})().catch(e => console.error('ERR:', e.message, e.stack));
