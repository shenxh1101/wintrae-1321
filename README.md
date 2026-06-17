# 健身房会员系统后端服务

基于 Node.js + Express + TypeScript + SQLite 构建的健身房会员系统后端服务，提供课程预约与签到能力。

## 功能特性

### 会员模块
- 会员登录认证（JWT）
- 会员个人信息查询
- 剩余次数与积分查询
- 预约历史记录查询
- 积分变动记录
- 系统通知管理

### 课程与教练模块
- 门店列表查询
- 课程列表与筛选（按类型、难度、关键词）
- 课程详情查询
- 教练列表与筛选
- 教练详情查询
- 课程排班查询（按日期、门店、课程类型、教练筛选）
- 教练排班查询

### 预约管理模块
- 创建预约（含满员自动加入候补）
- 取消预约（临近开课限制）
- 候补队列管理（自动转正）
- 重复预约校验
- 同时段冲突检测
- 每周预约次数限制
- 取消候补
- 我的预约列表

### 签到管理模块
- 签到码核验（会员端）
- 前台签到核验（签到码/手机号）
- 到店签到（提前30分钟窗口）
- 爽约标记与积分扣除
- 今日签到列表
- 排班签到统计

### 评价与积分模块
- 课后评价（1-5星）
- 课程评价列表
- 教练评价列表
- 我的评价查询
- 待评价课程列表
- 积分变动通知

### 运营报表模块
- 运营数据总览
- 每日满座率趋势
- 每日出勤率趋势
- 课程热度排行榜
- 教练评分排行榜
- 门店数据汇总
- 评价汇总分析

## 技术栈

- **运行时**: Node.js 16+
- **Web框架**: Express.js
- **开发语言**: TypeScript
- **数据库**: SQLite3
- **认证**: JWT (jsonwebtoken)
- **密码加密**: bcryptjs
- **工具库**: dayjs, uuid

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库与种子数据

```bash
npm run seed
```

### 3. 启动开发服务

```bash
npm run dev
```

服务默认启动在 `http://localhost:3000`

### 4. 生产构建

```bash
npm run build
npm start
```

## 默认测试账号

| 会员姓名 | 手机号       | 密码   | 会籍类型  |
|---------|------------|--------|----------|
| 张三    | 13800000001 | 123456 | 年卡      |
| 李四    | 13800000002 | 123456 | 月卡      |
| 王五    | 13800000003 | 123456 | 次卡      |
| 赵六    | 13800000004 | 123456 | 季卡      |

## API 接口清单

### 认证与会员
| 方法 | 路径 | 说明 | 认证 |
|-----|------|------|-----|
| POST | `/api/member/login` | 会员登录 | 否 |
| GET | `/api/member/profile` | 获取个人信息 | 是 |
| GET | `/api/member/remaining` | 查询剩余次数 | 是 |
| GET | `/api/member/booking-history` | 预约历史 | 是 |
| GET | `/api/member/points-records` | 积分记录 | 是 |
| GET | `/api/member/notifications` | 通知列表 | 是 |
| POST | `/api/member/notifications/:id/read` | 标记已读 | 是 |
| POST | `/api/member/notifications/read-all` | 全部已读 | 是 |

### 课程与教练
| 方法 | 路径 | 说明 | 认证 |
|-----|------|------|-----|
| GET | `/api/stores` | 门店列表 | 否 |
| GET | `/api/courses` | 课程列表 | 否 |
| GET | `/api/courses/:id` | 课程详情 | 否 |
| GET | `/api/coaches` | 教练列表 | 否 |
| GET | `/api/coaches/:id` | 教练详情 | 否 |
| GET | `/api/schedules` | 排班列表（多条件筛选） | 否 |
| GET | `/api/schedules/:id` | 排班详情 | 否 |
| GET | `/api/coaches/:id/schedules` | 教练排班 | 否 |

### 预约管理
| 方法 | 路径 | 说明 | 认证 |
|-----|------|------|-----|
| POST | `/api/booking` | 创建预约/候补 | 是 |
| POST | `/api/booking/:id/cancel` | 取消预约 | 是 |
| GET | `/api/booking/my` | 我的预约 | 是 |
| GET | `/api/booking/:id` | 预约详情 | 是 |
| DELETE | `/api/booking/waitlist/:id` | 取消候补 | 是 |

### 签到管理
| 方法 | 路径 | 说明 | 认证 |
|-----|------|------|-----|
| POST | `/api/checkin/verify` | 会员签到核验 | 是 |
| POST | `/api/checkin/frontdesk/verify` | 前台签到核验 | 否 |
| POST | `/api/checkin/mark-no-show` | 标记爽约 | 否 |
| GET | `/api/checkin/today-list` | 今日签到列表 | 否 |
| GET | `/api/checkin/schedule/:id/stats` | 排班签到统计 | 否 |

### 评价管理
| 方法 | 路径 | 说明 | 认证 |
|-----|------|------|-----|
| POST | `/api/review` | 提交评价 | 是 |
| GET | `/api/review/schedule/:scheduleId` | 课程评价列表 | 否 |
| GET | `/api/review/coach/:coachId` | 教练评价列表 | 否 |
| GET | `/api/review/my` | 我的评价 | 是 |
| GET | `/api/review/pending` | 待评价列表 | 是 |

### 运营报表
| 方法 | 路径 | 说明 | 认证 |
|-----|------|------|-----|
| GET | `/api/report/overview` | 运营总览 | 否 |
| GET | `/api/report/occupancy/daily` | 每日满座率 | 否 |
| GET | `/api/report/attendance/daily` | 每日出勤率 | 否 |
| GET | `/api/report/courses/ranking` | 课程热度排行 | 否 |
| GET | `/api/report/coaches/ranking` | 教练评分排行 | 否 |
| GET | `/api/report/stores/summary` | 门店汇总 | 否 |
| GET | `/api/report/reviews/summary` | 评价汇总 | 否 |

## 业务规则说明

### 预约规则
- **候补机制**: 课程满员时自动加入候补队列，有人取消自动转正
- **重复预约**: 同一排班不可重复预约
- **时段冲突**: 同时段只能预约一门课程
- **周限制**: 每周最多预约 5 节课
- **次数检查**: 剩余次数不足不可预约
- **会员有效期**: 过期会员不可预约

### 取消规则
- **取消时限**: 开课前 2 小时内不可取消
- **候补取消**: 候补队列随时可取消
- **次数返还**: 正常取消后返还剩余次数
- **自动转正**: 取消后自动处理候补队列

### 签到规则
- **签到窗口**: 开课前 30 分钟内可签到
- **迟到处理**: 开课后至课程结束前仍可签到（标记迟到）
- **爽约处理**: 课程结束未签到自动标记爽约，扣除 10 积分
- **签到奖励**: 成功签到奖励 5 积分

### 评价规则
- **评价条件**: 完成签到后方可评价
- **重复评价**: 每节课仅可评价一次
- **评价奖励**: 完成评价奖励 10 积分
- **教练评分**: 新评价自动更新教练平均评分

## 统一响应格式

```json
{
  "code": 0,
  "message": "操作成功",
  "data": {
    // 具体数据
  }
}
```

- `code`: 0 表示成功，非 0 表示失败
- `message`: 提示信息
- `data`: 响应数据

## 认证说明

需要认证的接口需在请求头中携带：

```
Authorization: Bearer <token>
```

登录成功后返回 `token` 字段。

## 数据库表结构

- `stores` - 门店表
- `members` - 会员表
- `courses` - 课程表
- `coaches` - 教练表
- `coach_schedules` - 教练排班表
- `bookings` - 预约表
- `reviews` - 评价表
- `points_records` - 积分记录表
- `notifications` - 通知表
