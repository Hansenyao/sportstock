import { Router } from 'express';
import * as ctrl from '../controllers/loan.controller';
import requireRole from '../middleware/requireRole';

const router = Router();

router.get('/',   ctrl.listLoans);
router.post('/',  ctrl.createLoan);

router.get('/:id',              ctrl.getLoan);
router.delete('/:id',           ctrl.deleteLoan);
router.patch('/:id',            ctrl.updateLoan);
router.post('/:id/approve',     requireRole('club_admin', 'asset_manager'), ctrl.approveLoan);
router.post('/:id/reject',      requireRole('club_admin', 'asset_manager'), ctrl.rejectLoan);
router.post('/:id/checkout',    requireRole('coach', 'club_admin', 'asset_manager'), ctrl.checkoutLoan);
router.post('/:id/return',      requireRole('club_admin', 'asset_manager'), ctrl.confirmReturn);

export default router;
