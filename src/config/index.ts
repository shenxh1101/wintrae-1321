export const config = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'gym-secret-key-2024',
  jwtExpiresIn: '7d',
  cancelDeadlineHours: 2,
  maxBookingsPerWeek: 5,
  noShowPenaltyPoints: 10,
  checkInWindowMinutes: 30,
  database: {
    path: './data/gym.db'
  }
};
