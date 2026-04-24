import { Router } from 'express';
import * as ctrl from '../controllers/user.controller';
import requireRole from '../middleware/requireRole';

const router = Router();

router.get('/',       ctrl.listUsers);
router.post('/',      requireRole('club_admin'), ctrl.createUser);
router.get('/:id',    ctrl.getUser);
router.put('/:id',    requireRole('club_admin'), ctrl.updateUser);
router.delete('/:id', requireRole('club_admin'), ctrl.deactivateUser);

export default router;
