# V-Connect

V-Connect is a full-stack volunteer coordination platform built for matching volunteers with community activities, helping organizers manage events, and supporting both web and mobile workflows from one shared backend.

The project is organized as a multi-client application:

- `web-app` - React + TypeScript web client for browser-based management and user workflows
- `mobile-app` - Expo React Native app for volunteers and organizers on mobile
- `shared-backend` - Express backend shared by the web and mobile clients

## Project Goals

V-Connect focuses on the operational flow around volunteer activities:

- Volunteers can register, manage their profile, set skills and availability, explore activities, and check in.
- Organizers can create activities, manage registrations, review participant status, and run activity check-in.
- Admin/reporting flows support user management, notifications, dashboard data, feedback review, and organizer summaries.
- Recommendation features help connect volunteers and activities based on profile and activity information.

## Key Features

- Authentication and profile registration
- Role-aware routing for volunteers and organizers
- Volunteer skills, interests, and availability management
- Activity creation, search, update, and deletion
- Activity registration and approval/rejection flow
- QR/manual check-in support
- Organizer activity management
- Feedback creation, review, flagging, and AI label update flow
- Admin user and notification management
- Recommendation endpoints and ML/recommendation utility scripts
- Location geocoding and map-ready activity location metadata
- Shared backend API consumed by web and mobile clients

## Repository Structure

```text
V-Connect/
├── mobile-app/        # Expo React Native mobile application
├── shared-backend/    # Express backend API
├── web-app/           # React + TypeScript + Vite web application
├── .github/           # GitHub Actions workflows
├── .gitignore
└── README.md
```

## Tech Stack

### Web App

- React 19
- TypeScript
- Vite
- React Router
- TanStack React Query
- Supabase client
- Leaflet / React Leaflet
- ExcelJS
- Lucide React
- ESLint

### Mobile App

- Expo
- React Native
- Expo Router
- React Navigation
- Supabase client
- Expo Camera
- Expo Secure Store
- Expo Image Picker
- QR code support
- TypeScript

### Backend

- Node.js
- Express
- PostgreSQL
- Supabase client
- CORS
- dotenv
- Node test runner

## Backend Architecture

The backend is split by domain modules. The current structure keeps the bootstrap files small and moves feature behavior into route, service, and validation layers.

Important backend areas include:

- `src/app.js` - Express app setup, middleware, router mounting, and error handling
- `src/server.js` - Server startup
- `src/routes/index.js` - API route aggregator
- `src/config` - Environment and shared constants
- `src/database` - Database client setup
- `src/common` - Shared utilities
- `src/auth` - Authentication and profile registration
- `src/users` - User-related operations
- `src/activities` - Activity CRUD and search
- `src/participations` - Registration and check-in flows
- `src/feedback` - Feedback review and moderation
- `src/notifications` - Notification management
- `src/recommendations` - Volunteer/activity recommendation workflows
- `src/admin` - Admin operations
- `src/reports` - Organizer reporting

All active endpoints are mounted directly from the root path.

## API Highlights

Examples of available backend endpoints:

- `GET /health`
- `POST /auth/register`
- `POST /auth/reset-password`
- `GET /auth/me`
- `POST /auth/register-profile`
- `GET /profile/skills-availability`
- `PUT /profile/skills-availability`
- `GET /availability-slots`
- `GET /activities`
- `GET /activities/search`
- `GET /activities/:id`
- `POST /activities`
- `PATCH /activities/:id`
- `DELETE /activities/:id`
- `POST /locations/geocode`
- `GET /participations`
- `POST /participations`
- `POST /participations/:id/check-in`
- `POST /activities/:id/register`
- `DELETE /activities/:id/register`
- `GET /activities/:id/registrations`
- `GET /registrations/:id`
- `PUT /registrations/:id/approve`
- `PUT /registrations/:id/reject`
- `GET /recommendations/:userId`
- `GET /recommendations/activity/:id`
- `POST /recommendations/activity/:id/assignments`
- `PUT /recommendations/assignments/:id/status`
- `DELETE /recommendations/assignments/:id`
- `GET /feedback`
- `GET /feedback/review`
- `GET /feedback/:id`
- `PUT /feedback/:id/status`
- `PUT /feedback/:id/ai-label`
- `PUT /feedback/:id/flag`
- `POST /feedback`
- `GET /admin/users`
- `GET /admin/notifications`
- `POST /admin/notifications`
- `PUT /admin/notifications/:id`
- `DELETE /admin/notifications/:id`
- `PATCH /admin/users/:id`
- `GET /admin/dashboard`
- `GET /organizer/reports/summary`

## Getting Started

### Prerequisites

- Node.js
- npm
- Supabase project credentials
- PostgreSQL-compatible database access
- Expo tooling for mobile development

### Backend

```bash
cd shared-backend
npm install
npm run dev
```

Expected local backend URL:

```text
http://localhost:3000
```

### Web App

```bash
cd web-app
npm install
npm run dev
```

### Mobile App

```bash
cd mobile-app
npm install
npm start
```

## Environment Variables

Each app contains its own environment requirements. Use the existing `.env.example` files as the starting point:

- `mobile-app/.env.example`
- `shared-backend/.env.example`
- `web-app/.env.example`

Typical values include API URLs, Supabase URLs, Supabase keys, and map/geocoding configuration.

## Location and Map Support

Activities support display-friendly address fields and optional geocoding metadata such as:

- address
- ward
- province/city
- formatted address
- latitude and longitude
- map provider
- geocode confidence

The backend exposes `POST /locations/geocode` for turning activity location input into map-ready metadata.

## Recommendation Work

The backend includes recommendation-related endpoints and utility scripts for:

- recommendation readiness checks
- model/demo data seeding
- recommendation training/evaluation flow
- activity recommendation assignment management

## Current Status

This repository is a student/portfolio project focused on full-stack system design, cross-client architecture, and practical volunteer coordination workflows. The project is not presented here as a production deployment.

## Author

Built and Led by [Loc-04](https://github.com/Loc-04).

