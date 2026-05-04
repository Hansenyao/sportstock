import { Router } from 'express';
import * as ctrl from '../controllers/report.controller';
import requireRole from '../middleware/requireRole';

const router = Router();
const mgr = requireRole('club_admin', 'asset_manager');

router.get('/summary',           mgr, ctrl.getSummary);
router.get('/depreciation',      mgr, ctrl.getDepreciation);
router.get('/loan-usage',        mgr, ctrl.getLoanUsage);
router.get('/movements/recent',  mgr, ctrl.getRecentMovements);
router.get('/movements',         mgr, ctrl.getMovements);
router.get('/alerts',            mgr, ctrl.getAlerts);

export default router;
