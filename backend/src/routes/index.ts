import { Router } from 'express';
import authenticate from '../middleware/auth';
import * as authCtrl from '../controllers/auth.controller';

import authRouter          from './auth';
import clubsRouter         from './clubs';
import usersRouter         from './users';
import teamsRouter         from './teams';
import assetsRouter        from './assets';
import loansRouter         from './loans';
import writeOffsRouter     from './write-offs';
import inventoryRouter     from './inventory';
import reportsRouter       from './reports';
import notificationsRouter from './notifications';

const router = Router();

// ── Public auth endpoints (no JWT required) ──────────────────
router.post('/auth/register',            authCtrl.register);
router.post('/auth/verify-email',        authCtrl.verifyEmail);
router.post('/auth/resend-verification', authCtrl.resendVerification);
router.post('/auth/login',               authCtrl.login);
router.post('/auth/forgot-password',     authCtrl.forgotPassword);
router.post('/auth/reset-password',      authCtrl.resetPassword);

// ── All routes below require a valid JWT ─────────────────────
router.use(authenticate);

router.use('/auth',          authRouter);
router.use('/clubs',         clubsRouter);
router.use('/users',         usersRouter);
router.use('/teams',         teamsRouter);
router.use('/assets',        assetsRouter);
router.use('/loans',         loansRouter);
router.use('/write-offs',    writeOffsRouter);
router.use('/inventory',     inventoryRouter);
router.use('/reports',       reportsRouter);
router.use('/notifications', notificationsRouter);

export default router;
