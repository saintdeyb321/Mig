import { confirmedWrite } from '../../../core/firebase/confirmedWrite.js';
import { db, auth } from '../../../core/firebase/client.js';
import { createNotificationRepository } from './notificationQueryRepository.js';
const repository = createNotificationRepository(db, { currentUser: () => auth.currentUser });
export const subscribeUnreadNotifications = repository.subscribeUnreadNotifications;
export const markNotificationRead = confirmedWrite(repository.markNotificationRead);
export const markAllNotificationsRead = confirmedWrite(repository.markAllNotificationsRead);
