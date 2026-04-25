import { Router } from 'express';
import * as ctrl from '../controllers/write-off.controller';
import requireRole from '../middleware/requireRole';

const router = Router();

const managerOnly = requireRole('club_admin', 'asset_manager');

router.get('/',    ctrl.listWriteOffs);
router.get('/:id', ctrl.getWriteOff);
router.post('/',   managerOnly, ctrl.createWriteOff);

export default router;
