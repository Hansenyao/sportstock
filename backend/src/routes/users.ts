import { Router } from 'express';
import * as ctrl from '../controllers/user.controller';
import requireRole from '../middleware/requireRole';

const router = Router();

router.get('/',           ctrl.listUsers);
router.get('/invites',    requireRole('club_admin'), ctrl.listInvites);
router.post('/invite',    requireRole('club_admin'), ctrl.inviteUser);
router.get('/:id',        ctrl.getUser);
router.put('/:id',        requireRole('club_admin'), ctrl.updateUser);
router.delete('/:id',     requireRole('club_admin'), ctrl.deactivateUser);

export default router;
