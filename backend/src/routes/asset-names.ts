import { Router } from 'express';
import * as ctrl from '../controllers/asset-name.controller';
import requireRole from '../middleware/requireRole';

const router = Router();
const mgr = requireRole('club_admin', 'asset_manager');

router.get('/',      ctrl.listAssetNames);
router.post('/',     mgr, ctrl.createAssetName);
router.put('/:id',   mgr, ctrl.updateAssetName);
router.delete('/:id', mgr, ctrl.deleteAssetName);

export default router;
