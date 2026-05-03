import { Router } from 'express';
import * as ctrl from '../controllers/inventory.controller';
import requireRole from '../middleware/requireRole';

const router = Router();
const mgr = requireRole('club_admin', 'asset_manager');

router.get('/movements', mgr, ctrl.listMovements);

router.post('/batches/:batchId/adjust',      mgr, ctrl.adjustBatch);
router.post('/batches/:batchId/retire',      mgr, ctrl.retireBatch);
router.post('/batches/:batchId/maintenance', mgr, ctrl.completeMaintenance);

router.get('/stocktake',      mgr, ctrl.listStocktakes);
router.post('/stocktake',     mgr, ctrl.createStocktake);
router.get('/stocktake/:id',  mgr, ctrl.getStocktake);
router.put('/stocktake/:id',  mgr, ctrl.updateStocktake);

export default router;
