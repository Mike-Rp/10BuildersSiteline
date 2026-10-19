import workspaceRoutes from "./services/workspace/routes.js";
import { get as databasePool, close as closePool } from "./common/pool-manager.js";
import 'dotenv/config';
import express, { json, urlencoded } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';

import archiveRoutes from "./services/archive/routes.js";
import { startArchiveMaintenance } from "./services/archive/scheduler.js";
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

import types from 'pg-types';
 
types.setTypeParser(1082, (val) => val);
const apiURL = process.env.API_URL || '/api/v1';
 
const app = express();
const port = Number(process.env.PORT || 3000);
 
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
app.use(cors());
 
app.get('/api/v1/health',async(req,res)=>{try{await (await databasePool()).query('select 1');res.json({ok:true,database:true});}catch{res.status(503).json({ok:false,database:false});}});
app.use('/api/v1',workspaceRoutes);
app.use(apiURL+'/archive',archiveRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));
app.use(`${apiURL}/accounts`, accountsRoutes);
 
app.use(`${apiURL}/auth`, authRoutes);
 
app.use(`${apiURL}/progress`, phaseRoutes);
app.use(`${apiURL}/progress`, progressRoutes);

app.use(`${apiURL}/confirmations`, confirmationsRoutes);

app.use(`${apiURL}/projects`, projectsRoutes);

app.use(`${apiURL}/subcontractors`, subcontractorsRoutes);

app.use(`${apiURL}/dashboard`, dashboardRoutes);

app.use(`${apiURL}/engineer`, engineerRoutes);

app.use(`${apiURL}/activity-logs`, activityLogRoutes);
 
const server=app.listen(port, process.env.HOST || '127.0.0.1', () => {
  if(process.env.ARCHIVE_MAINTENANCE_ENABLED === 'true') startArchiveMaintenance();
  console.log(`Server is running on http://localhost:${port}`);
});
for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>server.close(async()=>{await closePool();process.exit(0);}));
