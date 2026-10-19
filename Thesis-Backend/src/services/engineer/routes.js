import { Router } from "express";
import { getLicenses, getLicenseById, createLicense, updateLicense } from "../accounts/license.controller.js";
import { getCertifications, getCertificationById, createCertification } from "../accounts/certification.controller.js";
import { upload } from "../../common/utilities/upload.utility.js";
import {
  listAccounts, createAccount, getAccount, updateAccount, updateAccountStatus, regeneratePassword,
  getLicenses as getAccountLicenses, addLicense, uploadLicenseFile,
  replaceCertifications, getLicenseAlerts,
} from "../accounts/manage.controller.js";
import {
  getEngineers, downloadEngineerDocument, prepareContractUpload, uploadContractFile, uploadEmploymentContract,
} from "./engineers.controller.js";
import { requireLogin } from "../../common/utilities/access.utility.js";
const router = Router();


router.get('/license-alerts', async (req, res) => {
  await getLicenseAlerts(req, res);
});

router.get('/engineers', async (req, res) => {
  await getEngineers(req, res);
});

router.get('/engineers/:id/documents/:documentType/download', async (req, res) => {
  await downloadEngineerDocument(req, res);
});

router.post('/engineers/:id/employment-contract', prepareContractUpload, uploadContractFile, async (req, res) => {
  await uploadEmploymentContract(req, res);
});

router.get('/licenses', async (req, res) => {
  await getLicenses(req, res);
});

router.get('/licenses/:id', async (req, res) => {
  await getLicenseById(req, res);
});

router.post('/licenses/', upload.single('file'), async (req, res) => {
  await createLicense(req, res);
});

router.put('/licenses/:id', upload.single('file'), async (req, res) => {
  await updateLicense(req, res);
});

router.get('/certifications', async (req, res) => {
  await getCertifications(req, res);
});

router.get('/certifications/:id', async (req, res) => {
  await getCertificationById(req, res);
});

router.post('/certifications/', upload.single('file'), async (req, res) => {
  await createCertification(req, res);
});


router.get('/', async (req, res) => {
  await listAccounts(req, res);
});

router.post('/', async (req, res) => {
  await createAccount(req, res);
});

router.get('/:id', async (req, res) => {
  await getAccount(req, res);
});

router.patch('/:id', async (req, res) => {
  await updateAccount(req, res);
});

router.patch('/:id/status', async (req, res) => {
  await updateAccountStatus(req, res);
});

router.post('/:id/regenerate-password', async (req, res) => {
  await regeneratePassword(req, res);
});

router.get('/:id/licenses', async (req, res) => {
  await getAccountLicenses(req, res);
});

router.post('/:id/licenses', requireLogin, uploadLicenseFile, async (req, res) => {
  await addLicense(req, res);
});

router.put('/:id/certifications', async (req, res) => {
  await replaceCertifications(req, res);
});

export default router;