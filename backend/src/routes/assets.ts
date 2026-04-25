import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/asset.controller';
import requireRole from '../middleware/requireRole';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.get('/categories',   ctrl.listCategories);
router.post('/categories',  requireRole('club_admin', 'asset_manager'), ctrl.createCategory);
router.post('/bulk-import', requireRole('club_admin', 'asset_manager'), upload.single('file'), ctrl.bulkImport);

router.get('/',   ctrl.listAssets);
router.post('/',  requireRole('club_admin', 'asset_manager'), ctrl.createAsset);

router.get('/:id',               ctrl.getAsset);
router.put('/:id',               requireRole('club_admin', 'asset_manager'), ctrl.updateAsset);
router.delete('/:id',            requireRole('club_admin', 'asset_manager'), ctrl.deleteAsset);
router.put('/:id/image',         requireRole('club_admin', 'asset_manager'), upload.single('image'), ctrl.uploadImage);
router.get('/:id/depreciation',  requireRole('club_admin', 'asset_manager'), ctrl.getDepreciation);

export default router;
