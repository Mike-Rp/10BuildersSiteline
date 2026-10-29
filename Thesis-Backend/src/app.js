import workspaceRoutes from "./services/workspace/routes.js";
import { get as databasePool } from "./common/pool-manager.js";
import 'dotenv/config';
import express, { json, urlencoded } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';
import { handleError, sendError } from './common/utilities/access.utility.js';
import { loginFailureLimiter } from './common/utilities/rate-limit.utility.js';

import archiveRoutes from "./services/archive/routes.js";

import accountsRoutes from './services/accounts/routes.js';
import authRoutes from './services/auth/routes.js';
import phaseRoutes from "./services/progress/phase.routes.js";
import progressRoutes from './services/progress/routes.js';
import confirmationsRoutes from './services/confirmations/routes.js';
import projectsRoutes from './services/projects/routes.js';
import subcontractorsRoutes from './services/subcontractors/routes.js';
import dashboardRoutes from './services/dashboard/routes.js';
import engineerRoutes from './services/engineer/routes.js';
import activityLogRoutes from "./services/activity-logs/routes.js";
import notificationRoutes from "./services/notifications/routes.js";
import licenseRoutes from "./services/licenses/routes.js";
import cronRoutes from "./services/cron/routes.js";

import types from 'pg-types';
 
types.setTypeParser(1082, (val) => val);
const apiURL = process.env.API_URL || '/api/v1';
 
const app = express();

 
const swaggerUiOptions = {
  swaggerOptions: {
    tagsSorter: 'tagsDefined',
    operationsSorter: (a, b) => {
      const methodA = a.get('method').toUpperCase();
      const methodB = b.get('method').toUpperCase();
 
      const pathA = a.get('path');
      const pathB = b.get('path');
 
      const methodOrder = {
        'GET': 1,
        'POST': 2,
        'PUT': 3,
        'DELETE': 4
      };
 
      const weightA = methodOrder[methodA] || 99;
      const weightB = methodOrder[methodB] || 99;
 
      if (weightA !== weightB) {
        return weightA - weightB;
      }
 
      return pathA.length - pathB.length;
    }
  },
};
 
app.use(json({ limit: '2mb' }));
app.use(urlencoded({ extended: true }));
// CORS_ORIGINS (comma-separated) restricts browser origins; unset keeps the open default.
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);
app.use(corsOrigins.length ? cors({ origin: corsOrigins }) : cors());
if (process.env.VERCEL) app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Frame-Options', 'DENY');
  next();
});
app.post(/^\/api\/v1\/accounts\/[^/]+\/regenerate-password$/, loginFailureLimiter({ max: 5 }));
app.post([`${apiURL}/auth`, `${apiURL}/auth/admin`, '/api/v1/auth/login', '/api/v1/auth/admin/login'], loginFailureLimiter());
 
app.get('/api/v1/health',async(req,res)=>{try{await (await databasePool()).query('select 1');res.json({ok:true,database:true});}catch{res.status(503).json({ok:false,database:false});}});
app.use(`${apiURL}/cron`, cronRoutes);
app.use(`${apiURL}/notifications/v2`, notificationRoutes);
app.use('/api/v1',workspaceRoutes);
app.use(apiURL+'/archive',archiveRoutes);
const hostedProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
if (!hostedProduction || process.env.ENABLE_API_DOCS === 'true') {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
}
app.use(`${apiURL}/accounts`, accountsRoutes);
 
app.use(`${apiURL}/auth`, authRoutes);
 
app.use(`${apiURL}/progress`, phaseRoutes);
app.use(`${apiURL}/progress`, progressRoutes);

app.use(`${apiURL}/confirmations`, confirmationsRoutes);

app.use(`${apiURL}/projects`, projectsRoutes);

app.use(`${apiURL}/subcontractors`, subcontractorsRoutes);

app.use(`${apiURL}/dashboard`, dashboardRoutes);

app.use(`${apiURL}/engineer`, engineerRoutes);

app.use(`${apiURL}/licenses`, licenseRoutes);

app.use(`${apiURL}/activity-logs`, activityLogRoutes);

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.name === 'MulterError') {
    return sendError(res, error.code === 'LIMIT_FILE_SIZE' ? 'File is too large.' : 'Invalid upload.', 400);
  }
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status < 500) {
    return sendError(res, error.status === 413 ? 'Request body too large.' : error.message, error.status);
  }
  return handleError(res, error);
});
 

export default app;
