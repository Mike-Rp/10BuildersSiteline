import { requireLicenseAdmin } from '../accounts/prc-monitor.controller.js';
import { requireRoles } from '../../common/utilities/access.utility.js';
import { Router } from "express";
import { listAccounts as getUsers, getAccount as getUserById, createAccount as createUser,
  updateAccount as updateUser, deleteAccount as deleteUser, updateAccountStatus, regeneratePassword, issueTemporaryPassword } from "./manage.controller.js";
import { getLicenses, getLicenseById, createLicense, updateLicense } from "./license.controller.js";
import { getCertifications, getCertificationById, createCertification } from "./certification.controller.js";
import { upload } from "../../common/utilities/upload.utility.js";
const router = Router();
router.post("/temporary-password",issueTemporaryPassword);
router.patch("/:id/status",updateAccountStatus);
router.post("/:id/regenerate-password",regeneratePassword);
router.patch("/:id",updateUser);

router.get('/licenses', requireLicenseAdmin, async (req, res) => {
  await getLicenses(req, res);
});

router.get('/licenses/:id', requireLicenseAdmin, async (req, res) => {
  await getLicenseById(req, res);
});

router.post('/licenses/', requireLicenseAdmin, upload.single('file'), async (req, res) => {
  await createLicense(req, res);
});

router.put('/licenses/:id', requireLicenseAdmin, upload.single('file'), async (req, res) => {
  await updateLicense(req, res);
});

router.get('/certifications', requireRoles('admin'), async (req, res) => {
  await getCertifications(req, res);
});

router.get('/certifications/:id', requireRoles('admin'), async (req, res) => {
  await getCertificationById(req, res);
});

router.post('/certifications/', requireRoles('admin'), upload.single('file'), async (req, res) => {
  await createCertification(req, res);
});

router.get('/', async (req, res) => {
  await getUsers(req, res);
});

router.get('/:id', async (req, res) => {
  await getUserById(req, res);
});

router.post('/', async (req, res) => {
  await createUser(req, res);
});

router.put('/:id', async (req, res) => {
  await updateUser(req, res);
});

router.delete('/:id', async (req, res) => {
  await deleteUser(req, res);
});


export default router;