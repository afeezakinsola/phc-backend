/*
const swaggerJsDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "PHC API",
      version: "1.0.0",
      description:
        "A secure REST API for managing patient records in a Primary Health Care system. Supports authentication, role-based access, pagination, and file uploads.",
      contact: {
        name: "Afeez Akinsola",
        email: "your@email.com",
      },
    },
    tags: [
      {
        name: "Auth",
        description: "Authentication routes (register, login, users)",
      },
      { name: "Patients", description: "Patient management (CRUD operations)" },
    ],
    servers: [
      {
        url: "https://phc-backend-v9mb.onrender.com",
        description: "Production server",
      },
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Patient: {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
            gender: { type: "string", example: "male" },
            dateOfVisit: { type: "string", format: "date" },
            diagnosis: { type: "string" },
            treatment: { type: "string" },
            notes: { type: "string" },
          },
        },

        User: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            role: { type: "string", enum: ["doctor", "nurse"] },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            msg: { type: "string", example: "Error message" },
          },
        },

        SuccessResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "Operation successful" },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./routes/*.js"],
};

const swaggerSpec = swaggerJsDoc(options);

module.exports = swaggerSpec;
*/

const swaggerJsDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "PHC API",
      version: "1.1.0",
      description:
        "REST API for primary healthcare patient and staff management, with JWT authentication, role-based access, pagination, uploads and PDF export.",
    },
    tags: [
      { name: "Auth", description: "Authentication" },
      { name: "Staff", description: "Doctor and nurse profile management" },
      { name: "Patients", description: "Patient record management" },
    ],
    servers: [
      {
        url: "https://phc-backend-v9mb.onrender.com",
        description: "Production server",
      },
      { url: "http://localhost:3000", description: "Development server" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Patient: {
          type: "object",
          required: ["name", "age", "gender", "dateOfVisits", "diagnosis", "treatment"],
          properties: {
            name: { type: "string", example: "Jane Doe" },
            age: { type: "integer", example: 32 },
            gender: { type: "string", enum: ["male", "female"] },
            dateOfVisits: {
              type: "array",
              items: { type: "string", format: "date-time" },
            },
            diagnosis: { type: "string" },
            treatment: { type: "string" },
            notes: { type: "string" },
            attachments: { type: "array", items: { type: "string" } },
            createdAt: { type: "string", format: "date-time", readOnly: true },
            updatedAt: { type: "string", format: "date-time", readOnly: true },
          },
        },
        PatientUpdate: {
          type: "object",
          minProperties: 1,
          properties: {
            name: { type: "string" },
            age: { type: "integer" },
            gender: { type: "string", enum: ["male", "female"] },
            dateOfVisits: {
              type: "array",
              items: { type: "string", format: "date-time" },
            },
            diagnosis: { type: "string" },
            treatment: { type: "string" },
            notes: { type: "string" },
          },
          additionalProperties: false,
        },
        User: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["doctor", "nurse"] },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        StaffUpdate: {
          type: "object",
          minProperties: 1,
          properties: {
            name: { type: "string", minLength: 2, maxLength: 50 },
            email: { type: "string", format: "email" },
            role: { type: "string", enum: ["doctor", "nurse"] },
          },
          additionalProperties: false,
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean" },
            message: { type: "string" },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./routes/*.js"],
};

module.exports = swaggerJsDoc(options);
