import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/club.controller';
import requireRole from '../middleware/requireRole';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/me',      ctrl.getMyClub);
router.put('/me',      requireRole('club_admin'), ctrl.updateMyClub);
router.put('/me/logo', requireRole('club_admin'), upload.single('logo'), ctrl.uploadLogo);

export default router;
