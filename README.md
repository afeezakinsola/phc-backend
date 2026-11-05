/*
🏥 PHC Backend API

A secure, production-ready REST API for managing patient records in a Primary Health Care center.

🚀 Features
JWT Authentication (Doctor/Nurse)
Role-Based Access Control (RBAC)
Patient record management (CRUD)
File upload support (Lab results, scans)
Pagination, filtering & search
Case-insensitive patient queries
Doctor-only delete permissions
Redis caching for performance ⚡
Idempotency support (prevents duplicate requests)
Swagger API documentation
PDF export of patient records
Request validation (Joi)
Secure logging (Morgan + Winston)
Prometheus metrics endpoint
Rate limiting (API protection)

🛠 Tech Stack
Node.js
Express
MongoDB
Mongoose
Redis
JWT
Multer
PDFKit
Joi
Morgan
Winston
Prometheus Client
Swagger UI

🔗 Live API

https://phc-backend-v9mb.onrender.com
📌 API Versioning

All endpoints are versioned:

/api/v1

Example:

/api/v1/auth/register
/api/v1/auth/login
/api/v1/patients

📌 Endpoints
Auth
POST /api/auth/register
POST /api/auth/login
Patients
GET /api/patients
POST /api/patients
PUT /api/patients/:id
DELETE /api/patients/:id
GET /api/patients/:id
GET /api/patients/name/:name

⚡ Performance Features
Redis caching for faster responses
Cached GET requests for patients
Automatic cache invalidation on create/update/delete
Optimized pagination queries

🛡 Security Features
JWT authentication
Helmet security headers
Input validation (Joi)
MongoDB sanitization
HTTP parameter pollution protection
CORS enabled
Role-based authorization

📊 Observability
Morgan HTTP request logging
Winston file logging (error + combined logs)
Prometheus /metrics endpoint

📄 API Documentation

Swagger Docs:

https://phc-backend-v9mb.onrender.com/api-docs/

🔑 How to Test
Register user
Login → get JWT token
Add token to headers:
Authorization: Bearer <token>
Create patient
Test filtering, pagination, and search

⚡ Idempotency (Important)

To prevent duplicate requests:

Idempotency-Key: unique-key

Used for safe retries (especially POST requests).

📊 Metrics Endpoint
GET /metrics

Used for Prometheus monitoring.

📁 Logging

Logs stored in:

/logs/combined.log
/logs/error.log
🚀 Deployment

Deployed on Render:

https://phc-backend-fqt7.onrender.com

🔮 Future Improvements
Docker support
BullMQ background jobs
Email notifications
CI/CD pipeline (GitHub Actions)
Automated testing (Jest + Supertest)
Grafana dashboard integration

👨‍💻 Author

Afeez Akinsola
Backend Developer | Node.js | Express | MongoDB | System Design
*/

# PHC Backend API

Node.js and Express API for primary healthcare patient and staff management.

## Core features

- JWT authentication for doctor and nurse accounts
- Role-based access control
- Patient registration, retrieval, search, filtering, pagination, updates and PDF export
- Multiple patient visit dates stored in `dateOfVisits`
- Patient attachments through the existing upload middleware
- Staff directory and individual staff profiles
- Doctor-only staff profile updates and staff account deletion
- Doctor and nurse patient record deletion
- Redis patient-list caching and cache invalidation
- Idempotency support for patient creation
- Joi request validation
- Swagger API documentation at `/api-docs`
- Helmet, rate limiting, MongoDB sanitization and HTTP parameter pollution protection
- Morgan/Winston logging and Prometheus metrics at `/metrics`

## API base URL

`/api/v1`

## Authentication endpoints

- `POST /api/v1/auth/register` — public registration is currently retained for compatibility; see the security note below.
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/users` — authenticated doctors and nurses
- `GET /api/v1/auth/users/:id` — authenticated doctors and nurses
- `PATCH /api/v1/auth/users/:id` — doctors only; accepts `name`, `email`, and `role`
- `DELETE /api/v1/auth/users/:id` — doctors only

## Patient endpoints

- `GET /api/v1/patients` — authenticated patient list, search, filters and pagination
- `POST /api/v1/patients` — authenticated patient creation
- `GET /api/v1/patients/:id` — authenticated individual patient profile
- `PATCH /api/v1/patients/:id` — authenticated patient update
- `DELETE /api/v1/patients/:id` — doctor and nurse
- `GET /api/v1/patients/:id/export` — authenticated PDF export

## Patient visit dates

The Mongoose model stores visit dates in `dateOfVisits`, an array. The API accepts this canonical field. For backward compatibility, create/update requests may also send the former singular `dateOfVisit` field; the controller normalizes it into `dateOfVisits` before saving.

## Environment variables

Copy `.env.example` to `.env` for local development and supply real values. Never commit `.env` or expose secrets in frontend code.

On Render, configure `FRONTEND_URL` with the exact deployed frontend origin. Multiple origins may be comma-separated. Local development origins on port 3000 are already allowed.

## Important security note: public registration

The existing `/auth/register` endpoint remains public in this update to avoid silently changing the current onboarding flow. It accepts a `role` value, including `doctor`. Therefore, anyone who can reach the endpoint may currently register an account with doctor privileges. This should be restricted before production use (for example, bootstrap the first doctor and then require an authenticated doctor to create additional staff accounts). Do not treat hiding the registration form in the frontend as a security control.

## Run locally

```bash
npm install
npm run dev
```

The server requires MongoDB and Redis connectivity at startup.
