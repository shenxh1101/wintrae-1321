export interface Member {
  id: string;
  name: string;
  phone: string;
  email: string;
  avatar?: string;
  membershipType: 'monthly' | 'quarterly' | 'yearly' | 'count';
  membershipStart: string;
  membershipEnd: string;
  remainingCount: number;
  totalCount: number;
  points: number;
  status: 'active' | 'frozen' | 'expired';
  createdAt: string;
}

export interface Course {
  id: string;
  name: string;
  description: string;
  type: 'yoga' | 'pilates' | 'strength' | 'cardio' | 'dance' | 'boxing' | 'spinning' | 'other';
  duration: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  calories: number;
  coverImage?: string;
  createdAt: string;
}

export interface Coach {
  id: string;
  name: string;
  avatar?: string;
  title: string;
  specialties: string[];
  introduction: string;
  rating: number;
  experienceYears: number;
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface CoachSchedule {
  id: string;
  coachId: string;
  courseId: string;
  storeId: string;
  date: string;
  startTime: string;
  endTime: string;
  capacity: number;
  bookedCount: number;
  waitlistCount: number;
  status: 'scheduled' | 'cancelled' | 'completed';
  createdAt: string;
}

export interface Store {
  id: string;
  name: string;
  address: string;
  phone: string;
  businessHours: string;
  status: 'open' | 'closed';
}

export enum BookingStatus {
  BOOKED = 'booked',
  CANCELLED = 'cancelled',
  WAITLISTED = 'waitlisted',
  PROMOTED = 'promoted',
  CHECKED_IN = 'checked_in',
  NO_SHOW = 'no_show',
  COMPLETED = 'completed'
}

export interface Booking {
  id: string;
  memberId: string;
  scheduleId: string;
  status: BookingStatus;
  checkInCode?: string;
  checkInTime?: string;
  isWaitlist: boolean;
  waitlistPosition?: number;
  pointsChange: number;
  createdAt: string;
  cancelledAt?: string;
  cancelReason?: string;
}

export interface Review {
  id: string;
  bookingId: string;
  memberId: string;
  scheduleId: string;
  coachId: string;
  rating: number;
  content: string;
  images?: string[];
  createdAt: string;
}

export interface PointsRecord {
  id: string;
  memberId: string;
  change: number;
  type: 'check_in' | 'review' | 'no_show' | 'promotion' | 'other';
  description: string;
  relatedBookingId?: string;
  createdAt: string;
}

export interface Notification {
  id: string;
  memberId: string;
  type: 'points' | 'booking' | 'waitlist' | 'reminder';
  title: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}
