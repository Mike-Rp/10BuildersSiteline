// src/swagger.js
import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: '9th POS API Endpoints',
      version: '1.0.0',
    },
    tags: [
      {
        name: 'Authentication', 
        description: 'Endpoints managing user sessions',
      },
      {
        name: 'Businesses', 
        description: 'Endpoints managing businesses',
      },
      {
        name: 'Roles', 
        description: 'Endpoints managing roles and permissions',
      },
      {
        name: 'Users', 
        description: 'Endpoints managing users',
      },
      {
        name: 'Products', 
        description: 'Endpoints managing products',
      },
      {
        name: 'Inventory', 
        description: 'Endpoints checking inventory and inventory logs',
      },
      {
        name: 'Sales', 
        description: 'Endpoints for Point Of Sale (POS) functionality',
      },
      {
        name: 'Venue Units', 
        description: 'Endpoints for venue units',
      },
      {
        name: 'Reservations', 
        description: 'Endpoints for managing reservations',
      },
      {
        name: 'Attendance', 
        description: 'Endpoints for managing attendance records',
      },
      {
        name: 'Daycare', 
        description: 'Endpoints for managing daycare processes',
      },
      {
        name: 'Reports', 
        description: 'Endpoints for viewing reports',
      },
      {
        name: 'Audit Logs', 
        description: 'Endpoints for viewing audit logs',
      },
    ],
    servers: [
      {
        description: 'Local',
        url: 'http://localhost:3000',
      },
      {
        description: 'Production',
        url: 'https://ninthpos-service.onrender.com:3000',
      },
    ],
    security: [
      {
        ApiKeyAuth: []
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {            
          type: 'apiKey',
          in: 'header',
          name: 'Authorization',
        }
      }
    }
  },
  apis: ['./src/services/**/*.{js,yaml,json}', './src/index.js'], 
};

export const swaggerSpec = swaggerJsdoc(options);
