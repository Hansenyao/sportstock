import { Router } from 'express';
import * as ctrl from '../controllers/inventory.controller';
import requireRole from '../middleware/requireRole';

const router = Router();

const mgr = requireRole('club_admin', 'asset_manager');

router.get('/movements',             mgr, ctrl.listMovements);
router.post('/purchase',             mgr, ctrl.purchaseStock);
router.post('/adjust',               mgr, ctrl.adjustStock);
router.post('/retire',               mgr, ctrl.retireAsset);
router.post('/maintenance/complete', mgr, ctrl.completeMaintenance);

router.get('/stocktake',             mgr, ctrl.listStocktakes);
router.post('/stocktake',            mgr, ctrl.createStocktake);
router.get('/stocktake/:id',         mgr, ctrl.getStocktake);
router.put('/stocktake/:id',         mgr, ctrl.updateStocktake);

export default router;
