import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller';

// Protected routes — require authentication (mounted after authenticate middleware)
const router = Router();

router.get('/me',       ctrl.getMe);
router.put('/password', ctrl.changePassword);

export default router;
