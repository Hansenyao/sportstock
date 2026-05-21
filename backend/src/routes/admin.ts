// backend/src/routes/admin.ts
import { Router } from 'express';
import requireRole from '../middleware/requireRole';
import * as ctrl from '../controllers/admin.controller';

const router = Router();

router.use(requireRole('super_admin'));

router.get('/stats',                                      ctrl.getPlatformStats);
router.get('/analytics/overview',                         ctrl.getAnalyticsOverview);
router.get('/analytics/loans',                            ctrl.getAnalyticsLoans);
router.get('/analytics/assets',                           ctrl.getAnalyticsAssets);
router.get('/analytics/growth',                           ctrl.getAnalyticsGrowth);

router.get('/clubs',                                      ctrl.listClubs);
router.get('/clubs/:id',                                  ctrl.getClubDetail);
router.patch('/clubs/:id/status',                         ctrl.updateClubStatus);
router.post('/clubs/:id/reset-admin-password',            ctrl.resetClubAdminPassword);

router.get('/clubs/:id/users',                            ctrl.listClubUsers);
router.patch('/clubs/:id/users/:uid/status',              ctrl.updateUserStatus);
router.post('/clubs/:id/users/:uid/reset-password',       ctrl.resetUserPassword);

router.get('/clubs/:id/assets',                           ctrl.listClubAssets);
router.patch('/clubs/:id/assets/:aid/status',             ctrl.retireAsset);
router.delete('/clubs/:id/assets/:aid',                   ctrl.deleteAsset);

router.get('/clubs/:id/loans',                            ctrl.listClubLoans);

export default router;
