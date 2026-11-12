# Chikitsaak
### Integrated Digital Healthcare Platform

Chikitsaak is a full-stack healthcare management platform designed to bring patients, healthcare professionals, pharmacies, and diagnostic laboratories together in a unified digital ecosystem.

The platform simplifies healthcare workflows through doctor discovery, appointment management, online consultations, digital medical records, payment processing, and dedicated operational dashboards.

Built with Next.js and PostgreSQL, Chikitsaak focuses on secure application architecture, reliable transaction handling, accessible user experiences, and scalable healthcare workflows.

**Live Application:** https://chikitsaak.in

**Repository:** https://github.com/Rishikesh8447/Chikitsaak

---

## Overview

Healthcare services often operate across disconnected systems, making it difficult for patients and healthcare providers to manage appointments, consultations, prescriptions, and diagnostic services efficiently.

Chikitsaak addresses this challenge through a centralized platform that connects multiple healthcare stakeholders and provides dedicated workflows based on their roles and responsibilities.

The application supports a bilingual English and Hindi experience and follows a mobile-first Progressive Web App approach.

## Core Features

### Patient Management
- Discover verified doctors and explore medical specialties.
- Schedule and manage doctor appointments.
- Access online consultations.
- Manage personal medical information and digital prescriptions.
- View appointment history and related healthcare information.

### Doctor Management
- Doctor registration and profile management.
- Professional verification and approval workflows.
- Appointment scheduling and availability management.
- Patient consultation and appointment management.
- Digital prescription and clinical documentation workflows.

### Laboratory Management
- Laboratory registration and verification.
- Laboratory profiles and test catalogue management.
- Laboratory order management workflows.
- Dedicated laboratory dashboards.

### Pharmacy Management
- Pharmacy registration and verification.
- Product catalogue and inventory management.
- Product expiry and manufacturing information.
- Dedicated pharmacy management dashboard.

### Administrative Management
- Role-based administrative access.
- Doctor, pharmacy, and laboratory verification.
- User and platform management.
- Appointment and operational oversight.
- Credit transactions and payout management.

### Payments and Consultations
- Online payment integration with Razorpay.
- Server-side payment verification.
- Transactional credit management.
- Doctor payout workflows.
- Real-time video consultations using Vonage.

### Platform Experience
- English and Hindi bilingual interface.
- Progressive Web App experience.
- Responsive, mobile-first design.
- Light and dark themes.
- Role-specific navigation and dashboards.

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| UI & Styling | Tailwind CSS, shadcn/ui |
| Backend | Next.js Server Actions, API Routes |
| Database | PostgreSQL |
| ORM | Prisma |
| Authentication | Clerk |
| Payments | Razorpay |
| Video Communication | Vonage |
| AI Integrations | OpenAI |
| Email Services | Resend |
| Monitoring | Sentry |
| Testing | Playwright, Axe, Lighthouse CI |

## Project Structure

The application follows a modular organization that separates application interfaces, business operations, database access, and integrations.

Key application areas include:

- `app/` – Application routes, layouts, and pages.
- `actions/` – Server-side application operations.
- `components/` – Reusable UI components.
- `lib/` – Shared utilities and integrations.
- `prisma/` – Database schema and migration history.
- `public/` – Static assets and application resources.

*The structure above is a high-level overview; consult the repository for the complete directory organization.*

## Getting Started

### Prerequisites

- Node.js compatible with the project configuration.
- npm.
- PostgreSQL database.
- Required third-party service credentials.

### Installation

Clone the repository:

```bash
git clone https://github.com/Rishikesh8447/Chikitsaak.git
```

Navigate to the project directory:

```bash
cd Chikitsaak
```

Install dependencies:

```bash
npm install
```

Configure the environment variables using the project's environment template.

Generate the Prisma client:

```bash
npx prisma generate
```

Start the development server:

```bash
npm run dev
```

Open the application:

```text
http://localhost:3000
```

### Environment Configuration

The application integrates with external services that require environment-specific configuration.

Refer to the project's environment variable template for the exact variable names and required values.

Key integrations include:

- PostgreSQL connection.
- Clerk authentication.
- Razorpay payment gateway.
- Vonage video services.
- OpenAI integrations.
- Resend email services.
- Sentry monitoring.

Never commit production credentials, API secrets, or environment files containing sensitive information.

## Development & Quality Assurance

The project includes automated testing and code-quality tooling to support application reliability.

Run the configured test suite:

```bash
npx playwright test
```

For linting and production builds, use the scripts defined in `package.json`.

## Security Considerations

Security is an important part of the application architecture.

- Authentication and role-based authorization.
- Server-side validation of sensitive operations.
- Protected healthcare workflows.
- Server-side payment verification.
- Transactional handling of credits and payouts.
- Environment-based management of sensitive credentials.

## Contributing

Contributions, suggestions, and improvements are welcome.

1. Fork the repository.
2. Create a dedicated feature branch.
3. Implement and test your changes.
4. Submit a pull request with a clear description.

## Project Information

**Project:** Chikitsaak

**Category:** Full-Stack Healthcare Management Platform

**Developer:** Rishikesh Patel

**Live Website:** https://chikitsaak.in

**GitHub:** https://github.com/Rishikesh8447/Chikitsaak

---

*Chikitsaak — Care. Connected.*
