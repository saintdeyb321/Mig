import { db } from '../../../core/firebase/client.js';
import { createNotificationRepository } from './notificationQueryRepository.js';
export const { subscribeUnreadNotifications, markNotificationRead, markAllNotificationsRead } = createNotificationRepository(db);
