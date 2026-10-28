# Chikitsaak — Digital Healthcare Platform

<p align="center">
  <strong>A modern, full-stack healthcare ecosystem connecting patients, verified clinicians, diagnostic laboratories, and pharmacy services.</strong>
</p>

<p align="center">
  <a href="https://github.com/Rishikesh8447/Chikitsaak"><img alt="GitHub repository" src="https://img.shields.io/badge/GitHub-Chikitsaak-181717?logo=github"></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16.2-black?logo=next.js">
  <img alt="React" src="https://img.shields.io/badge/React-19.2-61DAFB?logo=react">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?logo=tailwind-css">
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-6.19-2D3748?logo=prisma">
  <img alt="PostgreSQL" src="https://img.shields.io/badge/PostgreSQL-Neon_Serverless-4169E1?logo=postgresql">
  <img alt="Clerk" src="https://img.shields.io/badge/Auth-Clerk_v7-6C47FF?logo=clerk">
  <img alt="Razorpay" src="https://img.shields.io/badge/Payments-Razorpay-02042B?logo=razorpay">
  <img alt="Vonage" src="https://img.shields.io/badge/Video-Vonage_API-000000?logo=vonage">
  <img alt="PWA" src="https://img.shields.io/badge/PWA-Installable-5A0FC8?logo=pwa">
</p>

---

## Table of Contents

- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Live Deployment](#live-deployment)
- [System Architecture](#system-architecture)
- [Core Features](#core-features)
  - [Patient Care Hub & Clinical Experience](#patient-care-hub--clinical-experience)
  - [Doctor Practice & Verification Dashboard](#doctor-practice--verification-dashboard)
  - [Diagnostic Laboratory Workflows](#diagnostic-laboratory-workflows)
  - [Pharmacy Catalog & Dispensing Management](#pharmacy-catalog--dispensing-management)
  - [Telehealth & Vonage Video Consultations](#telehealth--vonage-video-consultations)
  - [Online Payments & Doctor Payout Allocations](#online-payments--doctor-payout-allocations)
  - [AI Clinical Assistance](#ai-clinical-assistance)
  - [Automated Notifications & Reminders](#automated-notifications--reminders)
  - [Progressive Web App (PWA)](#progressive-web-app-pwa)
  - [Administrative Governance](#administrative-governance)
- [Technology Stack Audit](#technology-stack-audit)
- [Project Directory Structure](#project-directory-structure)
- [User Roles & Access Control](#user-roles--access-control)
- [Database & Schema Design](#database--schema-design)
- [Payment & Payout Lifecycle](#payment--payout-lifecycle)
- [Security, Privacy & Reliability](#security-privacy--reliability)
- [Getting Started & Local Development](#getting-started--local-development)
  - [Prerequisites](#prerequisites)
  - [Installation Steps](#installation-steps)
  - [Environment Variables Configuration](#environment-variables-configuration)
  - [Database Setup & Migrations](#database-setup--migrations)
  - [Development Server](#development-server)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Deployment Guide](#deployment-guide)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Author & License](#author--license)

---

## Overview

**Chikitsaak** (*चिकित्सक* — Sanskrit for "physician" or "healer") is a comprehensive, production-grade digital healthcare platform engineered to streamline the clinical consultation lifecycle. It unifies patient discovery, appointment scheduling, encrypted video consultations, digital prescription management, diagnostic lab ordering, and pharmacy fulfillment into a cohesive, responsive web application.

Built on **Next.js 16 (App Router)** and **React 19**, Chikitsaak utilizes a serverless architecture backed by **Neon PostgreSQL** and **Prisma ORM**, protected by **Clerk** authentication, and enhanced by integrations with **Vonage Video**, **Razorpay**, **OpenAI**, and **Resend**.

---

## Problem Statement

Traditional healthcare journeys are severely fragmented:
1. **Disjointed Consultations**: Patients schedule appointments on one portal, speak over third-party consumer video apps, receive handwritten prescriptions via chat, and manually find pharmacies or diagnostic labs.
2. **Administrative Overhead for Clinicians**: Doctors expend substantial effort managing availability, verifying patient histories, drafting consultation summaries, and reconciling earnings across online transactions and in-person cash visits.
3. **Disconnected Diagnostic & Pharmacy Workflows**: Diagnostic laboratories and retail pharmacies operate in isolation, lacking unified digital channels for direct doctor-prescribed test orders and patient medicine requests.

Chikitsaak addresses these challenges with an integrated healthcare hub that enforces end-to-end clinical provenance, robust financial reconciliation, and intuitive role-tailored workspaces.

---

## Live Deployment

- **Production URL**: [chikitsaak.in](https://chikitsaak-itkl3ytrh-rishikeshs-projects-06a0a197.vercel.app)
- **Deployment Platform**: Vercel
- **Database**: Neon Serverless PostgreSQL
- **Active Release Branch**: `release/green-frog-payment-schema`

---

## System Architecture

Chikitsaak follows a modern Next.js App Router architecture leveraging React Server Components (RSC) for optimized data fetching, Server Actions for transactional mutations, and Clerk middleware for secure edge authentication.

```mermaid
flowchart TD
    subgraph Client["Client Tier (Browser & PWA)"]
        UI["React 19 UI / Vessel Design System"]
        SW["Service Worker (sw.js / Offline Fallback)"]
        Manifest["Web App Manifest (PWA)"]
    end

    subgraph EdgeMiddleware["Edge Routing & Security"]
        MW["Clerk Middleware (proxy.js)"]
    end

    subgraph AppRouter["Next.js 16 App Router (Vercel Serverless)"]
        RSC["Server Components (Layouts & Pages)"]
        Actions["Server Actions (actions/*.js)"]
        CronRoutes["API Route Handlers (/api/cron/reminders)"]
        WebhookRoutes["API Route Handlers (/api/webhooks/razorpay)"]
    end

    subgraph SecurityAuth["Identity & Authorization"]
        ClerkAuth["Clerk Identity Platform"]
        SyncUser["checkUser Sync Engine"]
    end

    subgraph DataTier["Persistence Tier"]
        Prisma["Prisma ORM 6.19"]
        NeonDB[("Neon PostgreSQL Serverless")]
    end

    subgraph ExternalIntegrations["External Cloud Services"]
        Vonage["Vonage Video API (WebRTC)"]
        Razorpay["Razorpay Payments & Webhooks"]
        OpenAI["OpenAI gpt-4o-mini (Structured JSON)"]
        Resend["Resend Transactional Email"]
        Sentry["Sentry Error Monitoring"]
    end

    Client -->|HTTPS / WSS| MW
    MW -->|Authorized Navigation| AppRouter
    MW -->|Unauthenticated Protected Route| ClerkAuth

    AppRouter --> SecurityAuth
    SecurityAuth -->|Sync Identity| Prisma

    Actions -->|Queries & Transactions| Prisma
    CronRoutes -->|Verify Bearer Secret| Prisma
    WebhookRoutes -->|Verify HMAC Signature| Prisma
    Prisma -->|Pooled TCP / SSL| NeonDB

    Actions -->|Token Provisioning| Vonage
    Actions -->|Order Creation & Verification| Razorpay
    Actions -->|Intake Summaries & Notes| OpenAI
    Actions -->|Appointment & Alert Emails| Resend
    AppRouter -->|Runtime Telemetry| Sentry
```

---

## Core Features

### Patient Care Hub & Clinical Experience
- **Vessel Clinics-Inspired Aesthetic**: Editorial typography, muted slate/teal color palettes, high-trust visual hierarchy, and full light/dark theme switching powered by `next-themes`.
- **Intelligent Doctor Discovery**: Multi-parameter search by medical specialty, consultation mode (online video vs. in-person clinic visit), pricing, and real-time availability slots.
- **Appointment Scheduling Lifecycle**: Slot reservation, automated double-booking prevention, booking confirmations, and patient-initiated cancellations with status-aware refund policies.
- **Follow-up Appointments**: Dedicated follow-up booking linked directly to prior appointments (`originalAppointmentId`), with clinician-recommended follow-up intervals (`followUpDays`, `followUpRequired`).
- **Medical Records & Prescriptions**: Centralized access to past medical history, active prescriptions with dosage and instructions, and lab order summaries.
- **Patient Reviews**: 1-to-5 star rating and review submission for completed consultations.

### Doctor Practice & Verification Dashboard
- **Profile & Credential Onboarding**: Multi-step onboarding collecting medical license details, clinical specialties, consultation fees, experience, and bio.
- **Administrative Verification**: Rigorous status tracking (`PENDING`, `VERIFIED`, `REJECTED`). Unverified profiles cannot publish availability or conduct consultations.
- **Availability Management**: Dynamic schedule editor with customizable appointment duration, break intervals, and active day toggles.
- **Clinical Appointment Management**: Real-time dashboard to review upcoming consultations, start video calls, inspect patient medical notes, and mark sessions complete.
- **Digital Prescription Authoring**: Structured prescription creator capturing medication names, dosages, administration frequency, durations, special instructions, and follow-up requirements.
- **Doctor Payouts**: Direct withdrawal requests with automated calculation against payment collections, tracking requested, processing, completed, and rejected payout states.

### Diagnostic Laboratory Workflows
- **Laboratory Organization Management**: Creation and administration of diagnostic facilities with scoped staff memberships (`LAB_ADMIN`, `LAB_TECHNICIAN`).
- **Test Catalog & Offerings**: Customizable lab test catalog featuring turnaround times, pricing, sample requirements (e.g., blood, urine), and pre-test fasting instructions.
- **Lab Order Tracking**: End-to-end lifecycle management (`PENDING` -> `SAMPLE_COLLECTED` -> `PROCESSING` -> `COMPLETED`) with itemized test orders.
- **Comprehensive Audit Trail**: Dedicated `LaboratoryAuditEvent` logging actor actions, status transitions, and report uploads for regulatory accountability.

### Pharmacy Catalog & Dispensing Management
- **Pharmacy Partner Workflows**: Scoped pharmacy management with staff roles (`PHARMACY_ADMIN`, `PHARMACIST`).
- **Medicine & Product Catalog**: Inventory tracking with batch numbers, manufacturers, stock levels, manufacture dates, expiry dates, and Decimal prices.
- **Safe Decimal Serialization**: Server-side serialization converting Prisma Decimal types to plain strings, preventing Client Component hydration errors while preserving monetary precision.
- **Public Medicine Catalog**: Searchable patient-facing pharmacy catalog with real-time stock availability indicators.
- **Dispensing Audit Trail**: Dedicated `PharmacyAuditEvent` recording stock additions, modifications, and dispensing events.

### Telehealth & Vonage Video Consultations
- **WebRTC Video Rooms**: Integrated high-definition video consultations powered by the Vonage Video API (`@vonage/server-sdk`, `@vonage/auth`).
- **Routed Media Mode**: Scalable routed media topology ensuring consistent audio/video synchronization across devices and networks.
- **Secure Token Provisioning**: Ephemeral publisher tokens generated server-side with strict appointment expiration limits and participant identity metadata.
- **Session Recovery**: In-session recovery mechanism allowing participants to reconnect smoothly if temporary network disconnects occur.

### Online Payments & Doctor Payout Allocations
- **Razorpay Checkout Integration**: Server-orchestrated order creation and client checkout in Indian Rupees (INR) with paise-level precision.
- **Strict Mode Isolation**: Explicit separation between test (`rzp_test_`) and live (`rzp_live_`) environments. Credential mismatches fail closed without cross-mode fallback.
- **Server-Side Signature Verification**: Post-payment HMAC-SHA256 signature verification validating `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature` before confirming appointments.
- **Idempotent Webhook Handling**: Dedicated webhook route (`/api/webhooks/razorpay`) with replay attack protection via `RazorpayWebhookEvent` tracking.
- **Offline Cash Collection Audits**: In-clinic cash payments tracked via `AppointmentCashCollection` records capturing collector identities and timestamps.
- **Modern Payout Allocations**: Doctor payouts (`Payout`, `PayoutPaymentAllocation`) reserved against real completed appointments.
> [!NOTE]
> **Legacy Credit System Removal**: The legacy credit balance system was permanently removed in migration `20261024130000_remove_legacy_credit_system`, transitioning Chikitsaak to direct payment verification and transparent doctor payout accounting.

### AI Clinical Assistance
- **Pre-Consultation Intake Summaries**: Patients can provide free-form symptom descriptions, which OpenAI `gpt-4o-mini` structures into clean JSON containing symptoms, duration, relevant history, and suggested specialist questions.
- **Doctor Clinical Note Drafts**: Verified clinicians can generate draft consultation summaries, key observations, and follow-up guidance based on consultation notes.
- **Clinical Safety Guardrails**: Built with strict prompts: AI assistance never diagnoses, prescribes, or claims certainty. All outputs are strictly validated through **Zod** schemas before presentation.
- **Resilient Execution**: Implemented via native HTTP `fetch` with 20-second `AbortController` timeouts and graceful fallback handling when rate-limited.

### Automated Notifications & Reminders
- **Real-Time In-App Notifications**: Alerts for booking confirmations, cancellations, prescription releases, lab order updates, and payout processing.
- **Transactional Emails via Resend**: Structured, responsive emails for appointment bookings, doctor schedule changes, and consultation reminders.
- **Scheduled Cron Reminders**: Background cron endpoint (`/api/cron/reminders`) protected by bearer token authorization (`CRON_SECRET`), dispatching alerts at 24-hour, 1-hour, and 15-minute intervals.

### Progressive Web App (PWA)
- **Installable Desktop & Mobile App**: Compliant Web App Manifest (`app/manifest.js`) configured for `standalone` display with branded emerald and neutral color tokens.
- **Offline Resilience**: Dedicated service worker (`public/sw.js`) caching core offline fallbacks (`public/offline.html`).
- **Privacy-Safe Caching**: Only explicitly permitted public fallback routes are handled offline; authenticated healthcare data and patient records are never written to service worker caches.
- **Mobile Bottom Navigation**: Native app-like bottom navigation (`components/bottom-navigation.jsx`) delivering instant access to Care Hub, Appointments, Pharmacy, and Profile.
- **Install Promotion**: Smart install banner (`components/pwa-install-prompt.jsx`) honoring browser installation events.

### Administrative Governance
- **Role-Based Access Control (RBAC)**: Distinct permissions for `PATIENT`, `DOCTOR`, `ADMIN`, `LAB_ADMIN`, `LAB_TECHNICIAN`, `PHARMACY_ADMIN`, and `PHARMACIST`.
- **Doctor Verification Queue**: Review doctor credentials, medical council registration, and experience before activating public visibility.
- **Payment & Refund Oversight**: Administrative dashboard for inspecting payments, auditing cash collections, and approving or rejecting appointment refunds (`AppointmentRefundDecision`).
- **Platform Analytics**: High-level platform health metrics including appointment volume, revenue figures, active doctor counts, and laboratory order velocity.

---

## Technology Stack Audit

The following table reflects the exact audited versions and dependencies in the codebase:

| Category | Technology | Version | Purpose in Chikitsaak |
| :--- | :--- | :--- | :--- |
| **Framework** | Next.js (App Router) | `16.2.10` | React Server Components, Server Actions, Route Handlers, Turbopack |
| **Frontend UI** | React | `19.2.4` | Modern UI rendering with concurrent features and server components |
| **Styling** | Tailwind CSS | `v4` (`@tailwindcss/postcss: ^4`) | Utility-first styling engine with theme variables and responsive layouts |
| **UI Primitives** | Base UI | `^1.6.0` (`@base-ui/react`) | Unstyled, fully accessible UI primitive components |
| **UI Components** | shadcn/ui | `^4.13.0` | Accessible, customizable component primitives built on Radix/Base UI |
| **Icons** | Lucide React | `^1.24.0` | High-clarity SVG iconography |
| **Theming** | next-themes | `^0.4.6` | Flawless dark/light mode toggle with system preference detection |
| **CSS Utilities** | clsx, tailwind-merge, cva | `2.1.1`, `3.6.0`, `0.7.1` | Conflict-free className merging and conditional class composition |
| **Animations** | tw-animate-css | `^1.4.0` | Smooth transition utilities and keyframe animations |
| **Authentication** | Clerk Next.js & UI | `^7.5.18` / `^1.25.3` | Multi-factor authentication, session management, and Clerk user sync |
| **Database ORM** | Prisma ORM | `^6.19.3` | Type-safe schema definition, PostgreSQL queries, and migration runner |
| **Database Engine** | PostgreSQL (Neon) | Serverless | Serverless PostgreSQL with pooling and cold-start timeout tuning |
| **Video Telehealth** | Vonage Video API | `@vonage/server-sdk: ^3.29.0`, `@vonage/auth: ^1.17.0` | WebRTC session creation, token signing, and secure room management |
| **Online Payments** | Razorpay REST API | Direct Integration | INR checkout orders, HMAC-SHA256 verification, and webhook handlers |
| **Artificial Intelligence** | OpenAI API | Direct REST (`gpt-4o-mini`) | Structured JSON pre-consultation symptom parsing and doctor notes |
| **Transactional Email** | Resend | `^6.34.1` | Responsive transactional emails for bookings and reminders |
| **Form Handling** | React Hook Form | `^7.85.0` | Controlled/uncontrolled form state with fast re-rendering |
| **Schema Validation** | Zod | `^4.4.3` | Runtime input validation for forms, server actions, and AI outputs |
| **UI Notifications** | Sonner | `^2.0.7` | Rich, responsive toast notifications |
| **Spinners & Loaders** | react-spinners | `^0.17.0` | Accessible loading indicators for asynchronous operations |
| **Date Utilities** | date-fns | `^4.4.0` | Timezone-aware date arithmetic, slot formatting, and parsing |
| **Monitoring** | Sentry Next.js | `^10.73.0` | Full-stack error tracking, crash reporting, and performance monitoring |
| **Static Analysis** | ESLint & Next Config | `^9` / `16.2.10` | Code quality enforcement, unused import detection, and linting |
| **TypeScript Types** | TypeScript | `^5.9.3` | Type definitions for static verification and build tooling |
| **E2E Testing** | Playwright Test | `^1.63.0` | Cross-browser integration testing across desktop and mobile viewports |
| **Accessibility Testing**| Axe-core Playwright | `^4.13.0` | Automated WCAG 2.1 AA accessibility auditing in Playwright runs |
| **Performance Audit** | Lighthouse CI | `^0.15.1` (`@lhci/cli`) | Performance, accessibility, best practice, and PWA score auditing |

---

## Project Directory Structure

```text
chikitsaak/
├── actions/                         # Next.js Server Actions (Database & Business Logic)
│   ├── admin.js                     # Doctor verification, refund decisions, platform metrics
│   ├── ai.js                        # OpenAI pre-consultation & clinical note draft actions
│   ├── analytics.js                 # Administrative metrics calculation
│   ├── appointments.js              # Booking, cancellation, rescheduling & Vonage sessions
│   ├── doctor.js                    # Profile updates, slot availability & patient records
│   ├── doctors-listing.js           # Public directory search and specialty filtering
│   ├── laboratory.js                # Laboratory management, test catalog & order status
│   ├── medical.js                   # Medical history & patient health records
│   ├── notifications.js             # User notification read/dismiss operations
│   ├── onboarding.js                # Role assignment & profile initialization
│   ├── patient-dashboard.js         # Patient care hub appointments & prescriptions aggregation
│   ├── patient.js                   # Patient profile & personal health data
│   ├── payments.js                  # Razorpay checkout, verification & offline cash audits
│   ├── payout.js                    # Doctor payout requests & bank details
│   └── pharmacy.js                  # Pharmacy catalog, product management & dispensing
├── app/                             # Next.js App Router (Pages, Layouts & Route Handlers)
│   ├── (auth)/                      # Clerk sign-in / sign-up route group
│   ├── (main)/                      # Protected and public application views
│   │   ├── admin/                   # Admin portal: verification, refunds, payouts
│   │   ├── appointments/            # Patient appointment list & detail views
│   │   ├── contact-support/         # Help desk & support inquiries
│   │   ├── doctor/                  # Doctor workspace: schedule, consultations, prescriptions
│   │   ├── doctors/                 # Doctor search, profile & booking flows
│   │   ├── laboratory/              # Lab partner workspace & order fulfillment
│   │   ├── medical-records/         # Patient health records & digital prescriptions
│   │   ├── onboarding/              # User role selection (Patient / Doctor)
│   │   ├── pharmacy/                # Pharmacy catalog & partner management workspace
│   │   └── video-call/              # WebRTC video consultation room
│   ├── api/                         # HTTP API Route Handlers
│   │   ├── cron/reminders/          # Bearer-protected appointment reminder dispatch
│   │   └── webhooks/razorpay/       # HMAC-verified Razorpay webhook receiver
│   ├── globals.css                  # Tailwind CSS v4 design tokens and CSS variables
│   ├── layout.js                    # Root layout: Clerk, ThemeProvider, Header, BottomNav
│   ├── manifest.js                  # Dynamic Web App Manifest (PWA metadata)
│   └── page.jsx                     # Vessel-inspired homepage & hero search
├── components/                      # Reusable UI & Feature Components
│   ├── ui/                          # shadcn / Base UI primitives (buttons, dialogs, inputs)
│   ├── ai-doctor-note-assistant.jsx # Doctor clinical documentation AI assistant
│   ├── ai-preconsultation.jsx       # Patient symptom pre-consultation intake modal
│   ├── bottom-navigation.jsx        # PWA mobile bottom navigation bar
│   ├── doctor-card.jsx              # Search result card with pricing and availability badges
│   ├── doctor-search.jsx            # Specialty filter and keyword query bar
│   ├── header.jsx                   # Desktop navigation bar with role-aware action links
│   ├── notification-center.jsx      # In-app toast & notification dropdown
│   ├── offline-indicator.jsx        # Online/offline network status banner
│   ├── patient-care-hub.jsx         # Unified patient dashboard hub
│   ├── patient-pharmacy-catalog.jsx # Searchable medicine catalog with stock indicators
│   ├── pwa-install-prompt.jsx       # PWA installation banner
│   ├── service-worker-registration.jsx # Client-side Service Worker lifecycle registrar
│   ├── theme-provider.jsx           # Dark / light theme provider
│   ├── theme-toggle.jsx             # Theme switch dropdown
│   └── vessel-hero-search.jsx       # Vessel Clinics hero search component
├── lib/                             # Core Utilities, Configs & Third-Party Integrations
│   ├── ai.js                        # OpenAI HTTP client with structured JSON parsing
│   ├── appointment-payment-reconciliation.mjs # Serializable database transaction retry logic
│   ├── checkUser.js                 # Clerk to Neon PostgreSQL user synchronization
│   ├── email.js                     # Resend email templates & dispatch logic
│   ├── notifications.js             # Notification creation helpers
│   ├── prisma.js                    # Prisma client singleton with Neon connection timeout tuning
│   ├── razorpay.mjs                 # Razorpay API client & HMAC signature validator
│   ├── razorpay-config.mjs          # Mode-aware key & webhook secret resolution
│   ├── razorpay-webhook.mjs         # Webhook event processing and idempotency handler
│   ├── reminders.js                 # 24h, 1h, 15m reminder query and dispatch engine
│   └── utils.js                     # ClassName merger (cn) and formatting helpers
├── prisma/                          # Database Schema & Migrations
│   ├── migrations/                  # Active sequential Prisma migrations
│   ├── migrations-archive/          # Historical migration records
│   ├── schema.prisma                # Complete relational schema (26 models, 23 enums)
│   └── seed.js                      # Test data seeding script
├── public/                          # Static Assets & PWA Files
│   ├── icons/                       # High-resolution PWA icons (192px, 512px)
│   ├── offline.html                 # Standalone offline fallback screen
│   └── sw.js                        # Service Worker with offline caching strategy
├── scripts/                         # Build, Migration & Preflight Automation
│   ├── green-frog-schema-verification.cjs # Neon database target URL verifier
│   └── migration-preflight.cjs      # Zero-step migration preflight auditor
├── tests/                           # Automated Test Suites
│   ├── accessibility.spec.js        # Playwright + Axe-core WCAG AA test suite
│   ├── pharmacy-decimal-serialization.test.cjs # Decimal price serialization unit test
│   ├── razorpay-config.test.cjs     # Razorpay mode isolation test suite
│   ├── visual.spec.js               # Playwright visual regression snapshots
│   └── ...                          # 40+ unit, contract, and workflow test suites
├── DEPLOYMENT.md                    # Detailed production release and migration guide
├── next.config.mjs                  # Next.js configuration (Turbopack, headers, PWA)
├── package.json                     # Project dependencies and script declarations
├── proxy.js                         # Edge Clerk middleware routing rules
└── README.md                        # Comprehensive project documentation
```

---

## User Roles & Access Control

Access control in Chikitsaak is enforced strictly **server-side** in Server Actions and Route Handlers, never relying solely on client-side UI visibility:

1. **Patient (`PATIENT`)**:
   - Searches doctors, reserves appointment slots, and pays for consultations.
   - Attends video sessions, accesses digital prescriptions, and orders prescribed lab tests.
   - Submits structured pre-consultation symptom summaries.
   - Submits ratings and reviews for completed consultations.
2. **Doctor (`DOCTOR`)**:
   - Manages clinical profile and submits medical credentials for verification.
   - Once `VERIFIED`, configures weekly availability, slot durations, and buffer times.
   - Conducts video consultations, reviews patient medical records, and issues digital prescriptions.
   - Uses AI assistance to draft clinical documentation.
   - Requests earnings payouts against completed appointment collections.
3. **Administrator (`ADMIN`)**:
   - Reviews and verifies doctor applications (`VERIFIED` or `REJECTED`).
   - Audits offline cash collections and inspects payment transactions.
   - Reviews and decides on appointment refund requests (`AppointmentRefundDecision`).
   - Approves and disburses doctor payout requests.
   - Monitors overall platform analytics and operational logs.
4. **Laboratory Partner (`LAB_ADMIN`, `LAB_TECHNICIAN`)**:
   - Configures diagnostic facility profiles and manages test catalogs with pricing.
   - Manages sample collection, test processing, and order completion with audit logging.
5. **Pharmacy Partner (`PHARMACY_ADMIN`, `PHARMACIST`)**:
   - Manages medicine catalogs, stock levels, batch numbers, and expiry dates.
   - Dispenses prescriptions and tracks inventory changes via audit logs.

---

## Database & Schema Design

Chikitsaak models its domain using **Prisma ORM** targeting **PostgreSQL on Neon**. The schema comprises **26 models** and **23 enums**:

### Core Entity Relationships
- **User & Authentication**:
  - `User`: Central account record linked to Clerk via `clerkUserId`. Stores role (`PATIENT`, `DOCTOR`, `ADMIN`), verification status, contact details, specialty, and bio.
- **Consultation Scheduling**:
  - `Availability`: Recurring doctor availability slots with start/end times and slot duration.
  - `Appointment`: Clinical bookings linking patient and doctor. Tracks appointment mode (`ONLINE`, `OFFLINE`), appointment status (`SCHEDULED`, `CONFIRMED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`), video session credentials, follow-up links (`originalAppointmentId`), and payment relations.
- **Payments & Payouts**:
  - `AppointmentPayment`: Captures payment attempts, Razorpay order IDs, payment IDs, amounts, and statuses (`PENDING`, `PROCESSING`, `PAID`, `FAILED`, `REFUNDED`).
  - `RazorpayWebhookEvent`: Idempotent log of inbound Razorpay webhook events.
  - `AppointmentCashCollection`: Audited record of offline in-clinic cash collections.
  - `AppointmentRefundDecision`: Administrative record of refund approvals, rejections, and amounts.
  - `Payout` & `PayoutPaymentAllocation`: Payment-backed doctor payout tracking linking specific completed appointments to payout requests.
- **Clinical Records**:
  - `Prescription` & `PrescriptionMedicine`: Comprehensive prescriptions detailing drug names, dosages, frequencies, durations, instructions, and follow-up guidance.
  - `Review`: Verified patient ratings and feedback.
  - `Notification` & `AppointmentReminder`: Real-time user alerts and time-indexed reminder records (24h, 1h, 15m).
- **Diagnostic Laboratory**:
  - `Laboratory`, `LaboratoryMembership`, `LabTest`, `LaboratoryOffering`, `LabOrder`, `LabOrderItem`, `LabOrderStatusHistory`, `LaboratoryAuditEvent`.
- **Pharmacy**:
  - `Pharmacy`, `PharmacyMembership`, `PharmacyProduct`, `PharmacyAuditEvent`.

### Connection Resilience
Neon PostgreSQL compute endpoints experience cold-start delays (3–6 seconds). To eliminate connection dropouts, `lib/prisma.js` explicitly configures connection pooling parameters:
```javascript
// Ensure Prisma allows 15s to establish connection during compute wake-up
connect_timeout = 15
pool_timeout = 15
```

---

## Payment & Payout Lifecycle

Chikitsaak implements a robust financial flow ensuring zero lost revenue and complete auditability:

```mermaid
sequenceDiagram
    autonumber
    actor Patient
    participant Browser as Browser Client
    participant Server as Next.js Server Action
    participant RZP as Razorpay API
    participant DB as Neon PostgreSQL

    Patient->>Browser: Select appointment slot & click Book
    Browser->>Server: createAppointmentWithPayment({ slotId, amount })
    Server->>DB: Verify slot availability & create Appointment (SCHEDULED)
    Server->>RZP: Create Razorpay Order (INR paise)
    RZP-->>Server: Return rzp_order_id
    Server->>DB: Create AppointmentPayment (PENDING)
    Server-->>Browser: Return order details & Razorpay Checkout options

    Browser->>Patient: Render Razorpay Checkout Modal
    Patient->>Browser: Authorize payment (UPI / Card / NetBanking)
    Browser->>Server: verifyAppointmentPayment({ paymentId, orderId, signature })

    Server->>Server: Compute HMAC-SHA256 signature
    alt Signature Valid
        Server->>DB: Update AppointmentPayment to PAID
        Server->>DB: Update Appointment to CONFIRMED
        Server->>DB: Create Notification & Schedule Reminders
        Server-->>Browser: Return Booking Success
    else Signature Invalid
        Server->>DB: Mark AppointmentPayment as FAILED
        Server-->>Browser: Return Verification Error
    end
```

---

## Security, Privacy & Reliability

- **Edge Authentication**: Clerk middleware (`proxy.js`) intercepts all sensitive route segments (`/doctor/*`, `/admin/*`, `/appointments/*`, `/video-call/*`, `/laboratory/*`, `/pharmacy/workspace/*`) before page execution.
- **Server Action Authorization**: Every Server Action validates `auth().userId` and verifies database role permissions before reading or mutating records.
- **Cryptographic Signature Verification**: Razorpay payment confirmations and webhooks are verified using `crypto.createHmac("sha256", secret)` against raw request payloads to prevent spoofing.
- **Data Isolation & Secrets Separation**: Sensitive API keys (`CLERK_SECRET_KEY`, `RAZORPAY_KEY_SECRET`, `VONAGE_PRIVATE_KEY`, `OPENAI_API_KEY`, `CRON_SECRET`) are never prefixed with `NEXT_PUBLIC_` and are completely excluded from client bundles.
- **Decimal Precision**: Pharmacy product pricing uses PostgreSQL `Decimal(10,2)` types and is serialized to string formats before passing to Client Components, preventing floating-point rounding errors.
- **Non-Diagnostic AI Safeguards**: System prompts for `gpt-4o-mini` forbid autonomous medical diagnosis or prescription advice. All AI responses undergo Zod schema parsing.
- **Audit Logging**: Actor-attributed audit tables (`LaboratoryAuditEvent`, `PharmacyAuditEvent`, `AppointmentCashCollection`) track operational mutations for compliance.

---

## Getting Started & Local Development

### Prerequisites
- **Node.js**: `v20.x` or later (LTS recommended)
- **Package Manager**: `npm` (included with Node.js)
- **Database**: PostgreSQL instance (local or hosted on [Neon](https://neon.tech))
- **Clerk Account**: Free development account at [clerk.com](https://clerk.com)
- **Optional Services**: Razorpay test keys, Vonage Video API keys, OpenAI API key, Resend API key

### Installation Steps

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/Rishikesh8447/Chikitsaak.git
   cd Chikitsaak
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Create a `.env.local` file in the project root:
   ```bash
   cp .env.example .env.local
   ```
   Populate the values using the reference table below.

4. **Initialize Prisma & Generate Client**:
   ```bash
   npx prisma generate
   ```

5. **Apply Database Migrations**:
   ```bash
   npx prisma migrate deploy
   ```

6. **Seed Initial Development Data (Optional)**:
   ```bash
   npm run db:seed
   ```

7. **Start the Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Environment Variables Configuration

| Variable | Description | Required | Safe Placeholder Example |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string with SSL mode | **Yes** | `postgresql://user:pass@ep-name.region.neon.tech/neondb?sslmode=require` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser publishable key | **Yes** | `pk_test_Y2xlcmsuZXhhbXBsZS5jb20k` |
| `CLERK_SECRET_KEY` | Clerk server-side secret key | **Yes** | `sk_test_51AbCdEfGhIjKlMnOpQrStUvWxYz` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Clerk sign-in redirect route | **Yes** | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Clerk sign-up redirect route | **Yes** | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | Post sign-in redirect destination | **Yes** | `/onboarding` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | Post sign-up redirect destination | **Yes** | `/onboarding` |
| `NEXT_PUBLIC_VONAGE_APPLICATION_ID` | Vonage Video Application ID | Optional* | `b1234567-89ab-cdef-0123-456789abcdef` |
| `VONAGE_PRIVATE_KEY` | Vonage Application Private Key (PEM format) | Optional* | `"-----BEGIN PRIVATE KEY-----\nMIIEvgIB...-----END PRIVATE KEY-----"` |
| `RAZORPAY_MODE` | Active payment mode (`test` or `live`) | Optional | `test` (defaults to test) |
| `RAZORPAY_KEY_ID` | Public Razorpay key ID matching mode | Optional* | `rzp_test_1234567890abcdef` |
| `RAZORPAY_KEY_SECRET` | Server-only Razorpay secret key | Optional* | `secret_abcdef1234567890` |
| `RAZORPAY_TEST_WEBHOOK_SECRET` | Test mode webhook signature secret | Optional* | `whsec_test_1234567890` |
| `RAZORPAY_LIVE_WEBHOOK_SECRET` | Live mode webhook signature secret | Optional* | `whsec_live_1234567890` |
| `OPENAI_API_KEY` | OpenAI API key for clinical assistance | Optional* | `sk-proj-abcdef1234567890` |
| `OPENAI_MODEL` | Custom OpenAI model identifier | Optional | `gpt-4o-mini` (defaults to gpt-4o-mini) |
| `RESEND_API_KEY` | Resend API key for transactional emails | Optional* | `re_1234567890_abcdefgh` |
| `EMAIL_FROM` | Transactional email sender identity | Optional | `Chikitsaak <notifications@chikitsaak.in>` |
| `CRON_SECRET` | Bearer secret for appointment reminder cron | Optional* | `super_secret_random_cron_token_32chars` |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry client telemetry DSN | Optional | `https://examplePublicKey@o0.ingest.sentry.io/0` |

*\*Optional features gracefully disable when their respective keys are omitted, allowing core development without third-party accounts.*

---

### Database Setup & Migrations

Chikitsaak manages PostgreSQL schema migrations using Prisma. The repository contains sequential migrations covering the baseline schema, laboratory workflows, pharmacy services, payment states, and follow-up appointments.

```bash
# Generate the updated Prisma Client
npx prisma generate

# Inspect migration status against the target database
npx prisma migrate status

# Apply pending migrations in production or staging
npx prisma migrate deploy

# Launch visual database browser
npx prisma studio
```

For production deployments targeting Neon, refer to [`DEPLOYMENT.md`](./DEPLOYMENT.md) for preflight check instructions:
```bash
npm run db:migration-preflight -- --expect reconciled --database neondb --host ep-your-host.neon.tech
```

---

## Testing & Quality Assurance

Chikitsaak maintains high quality standards through automated static analysis, unit test suites, browser-level integration tests, and accessibility audits.

### Available Scripts

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Starts Next.js development server on `localhost:3000` |
| `npm run build` | Produces an optimized production build (`next build`) |
| `npm start` | Runs the compiled production application |
| `npm run lint` | Executes ESLint 9 checks across the codebase |
| `npm run db:seed` | Seeds database with initial reference records |
| `npm run db:migration-preflight` | Validates migration ledger integrity before deployment |
| `npm run test:e2e` | Runs end-to-end browser tests using Playwright |
| `npm run test:visual` | Runs Playwright visual regression screenshot tests |
| `npm run test:a11y` | Executes automated WCAG AA accessibility tests via Axe-core |
| `npm run lighthouse:ci` | Builds application and runs automated Lighthouse CI audits |

### Running Unit & Integration Tests

The project includes over 40 focused unit and contract test suites executed via the native Node.js test runner:

```bash
# Run representative contract and serialization tests
node --test tests/pharmacy-decimal-serialization.test.cjs
node --test tests/razorpay-config.test.cjs
node --test tests/laboratory-database-contract.test.cjs
node --test tests/pharmacy-database-contract.test.cjs

# Run all test suites
node --test tests/*.test.cjs
```

---

## Deployment Guide

Chikitsaak is optimized for deployment on **Vercel** connected to **Neon Serverless PostgreSQL**.

### Deployment Checklist

1. **Database Configuration**:
   - Create a Neon PostgreSQL database with SSL enabled.
   - Run the migration preflight check as documented in [`DEPLOYMENT.md`](./DEPLOYMENT.md).
   - Execute `npx prisma migrate deploy` to ensure all 11 active migrations are recorded.
2. **Vercel Project Setup**:
   - Link the GitHub repository and specify the active release branch (`release/green-frog-payment-schema`).
   - Add all environment variables listed in the configuration table to the Vercel dashboard.
3. **Clerk Production Settings**:
   - Add your custom domain (e.g., `chikitsaak.in`) to the Clerk Dashboard Allowed Origins.
   - Configure OAuth redirect URLs and verify production session lifetimes.
4. **Razorpay & Webhooks**:
   - Configure a webhook endpoint in Razorpay Dashboard pointing to `https://your-domain.com/api/webhooks/razorpay`.
   - Subscribe to `order.paid`, `payment.captured`, and `payment.failed` events with matching webhook secret.
5. **Scheduled Cron Reminders**:
   - Set up an external cron service (such as Vercel Cron or GitHub Actions) to call `GET /api/cron/reminders` with header:
     ```http
     Authorization: Bearer <CRON_SECRET>
     ```
     at 15-minute intervals.
6. **Post-Deployment Verification**:
   - Verify patient onboarding, doctor search, appointment booking checkout, and video call room initialization.

---

## Roadmap

- [x] Next.js 16 App Router & React 19 architecture
- [x] Vessel Clinics-inspired UI with light/dark theme toggle
- [x] Patient Care Hub & mobile-first PWA bottom navigation
- [x] Vonage Video API WebRTC consultations with token recovery
- [x] Razorpay online checkout with HMAC-SHA256 verification
- [x] Payment-backed doctor payouts and offline cash collection audits
- [x] Diagnostic laboratory catalog, test ordering, and status history
- [x] Pharmacy product catalog, inventory tracking, and dispensing workflows
- [x] Non-diagnostic AI clinical assistance with strict Zod validation
- [x] Automated appointment reminder cron engine (24h, 1h, 15m)
- [x] Progressive Web App with standalone manifest and offline fallback screen
- [ ] Push notifications via Web Push API for mobile PWA installations
- [ ] Multi-party video consultations (patient, doctor, and family member)
- [ ] Direct digital signature support on generated prescription PDFs

---

## Contributing

Contributions to Chikitsaak are welcome. To maintain code quality and patient data safety:

1. **Fork the Repository**: Create your personal fork on GitHub.
2. **Create a Feature Branch**: `git checkout -b feature/your-feature-name`.
3. **Adhere to Code Standards**: Ensure clean ESLint runs (`npm run lint`) and write corresponding tests under `tests/`.
4. **Preserve Security Controls**: Never disable authentication guards, bypass signature verifications, or expose private keys.
5. **Open a Pull Request**: Submit a clear PR describing your changes, architectural decisions, and testing verification.

---

## Author & License

- **Lead Engineer & Author**: [Rishikesh Patel](https://github.com/Rishikesh8447)
- **Repository**: [https://github.com/Rishikesh8447/Chikitsaak](https://github.com/Rishikesh8447/Chikitsaak)

<p align="center">
  <sub>Built with care to provide accessible, reliable, and transparent digital healthcare.</sub>
</p>
