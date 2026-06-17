import express from 'express';
import cors from 'cors';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

import memberRoutes from './routes/member';
import courseRoutes from './routes/course';
import bookingRoutes from './routes/booking';
import checkinRoutes from './routes/checkin';
import reviewRoutes from './routes/review';
import reportRoutes from './routes/report';
import { success } from './utils/response';

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get('/', (req, res) => {
  success(res, {
    service: '健身房会员系统后端服务',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      member: '/api/member/*',
      course: '/api/course/*',
      booking: '/api/booking/*',
      checkin: '/api/checkin/*',
      review: '/api/review/*',
      report: '/api/report/*'
    }
  });
});

app.get('/health', (req, res) => {
  success(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.use('/api/member', memberRoutes);
app.use('/api', courseRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/checkin', checkinRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/report', reportRoutes);

app.use(notFoundHandler);

app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`\n========================================`);
  console.log(`  健身房会员系统后端服务启动成功!`);
  console.log(`  服务地址: http://localhost:${config.port}`);
  console.log(`  API文档:   http://localhost:${config.port}/`);
  console.log(`  健康检查: http://localhost:${config.port}/health`);
  console.log(`========================================\n`);
  console.log(`测试账号（密码均为 123456）:`);
  console.log(`  张三 - 13800000001`);
  console.log(`  李四 - 13800000002`);
  console.log(`  王五 - 13800000003`);
  console.log(`  赵六 - 13800000004\n`);
});

export default app;
