import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/asset.controller';
import requireRole from '../middleware/requireRole';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const mgr = requireRole('club_admin', 'asset_manager');

router.get('/categories',   ctrl.listCategories);
router.post('/categories',  mgr, ctrl.createCategory);

router.get('/',   ctrl.listAssets);
router.post('/',  mgr, ctrl.createAsset);

router.get('/:id',       ctrl.getAsset);
router.put('/:id',       mgr, ctrl.updateAsset);
router.delete('/:id',    mgr, ctrl.deleteAsset);
router.put('/:id/image', mgr, upload.single('image'), ctrl.uploadImage);

router.post('/:id/batches',                      mgr, ctrl.addBatch);
router.put('/:id/batches/:batchId',              mgr, ctrl.updateBatch);
router.get('/:id/batches/:batchId/depreciation', mgr, ctrl.getDepreciation);

export default router;
