import { Router } from 'express';
import * as ctrl from '../controllers/team.controller';
import requireRole from '../middleware/requireRole';

const router = Router();

// Team CRUD — only club_admin can write
router.get('/',    ctrl.listTeams);
router.post('/',   requireRole('club_admin'), ctrl.createTeam);
router.get('/:id', ctrl.getTeam);
router.put('/:id', requireRole('club_admin'), ctrl.updateTeam);
router.delete('/:id', requireRole('club_admin'), ctrl.deleteTeam);

// Team member management — only club_admin
router.post('/:id/members',             requireRole('club_admin'), ctrl.addMember);
router.put('/:id/members/:userId',      requireRole('club_admin'), ctrl.updateMember);
router.delete('/:id/members/:userId',   requireRole('club_admin'), ctrl.removeMember);

export default router;
