import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller';

const router = Router();

router.get('/me', ctrl.getMe);

export default router;
