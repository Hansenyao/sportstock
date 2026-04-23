import { Router } from 'express';
import * as ctrl from '../controllers/notification.controller';

const router = Router();

router.get('/',             ctrl.listNotifications);
router.put('/read-all',     ctrl.markAllRead);
router.put('/:id/read',     ctrl.markRead);
router.post('/fcm-token',   ctrl.registerToken);
router.delete('/fcm-token', ctrl.unregisterToken);

export default router;
