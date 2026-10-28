import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { requireLicenseAdmin, listLicenseWarnings, renewPrcLicense } from './prc-monitor.controller.js';

const router = Router();
const directory = path.resolve('uploads', 'prc-licenses');
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, callback) {
      fs.mkdirSync(directory, { recursive: true });
      callback(null, directory);
    },
    filename(req, file, callback) {
      callback(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const ext = path.extname(file.originalname).toLowerCase();
    const allowed = (ext === '.pdf' && file.mimetype === 'application/pdf') ||
      (['.jpg','.jpeg'].includes(ext) && file.mimetype === 'image/jpeg') ||
      (ext === '.png' && file.mimetype === 'image/png');
    callback(allowed ? null : new Error('Only PDF, JPG and PNG files are allowed.'), allowed);
  }
});

router.use(requireLicenseAdmin);
router.get('/warnings', listLicenseWarnings);
router.post('/renew', upload.single('file'), renewPrcLicense);
export default router;
