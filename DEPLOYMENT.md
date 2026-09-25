# Deployment

## Environment

Set these variables in the deployment dashboard (never commit their values):

- `DATABASE_URL` — server-only Prisma connection string.
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — browser-safe Clerk publishable key.
- `CLERK_SECRET_KEY` — server-only Clerk secret.
- `NEXT_PUBLIC_VONAGE_APPLICATION_ID` — browser-safe Vonage application ID.
- `VONAGE_PRIVATE_KEY` — server-only Vonage private key.
- `OPENAI_API_KEY` — server-only OpenAI key.
- `OPENAI_MODEL` — optional model name; defaults to `gpt-4o-mini`.
- `CRON_SECRET` — server-only long random value used by the reminder endpoint.

Configure production Clerk origins and redirect URLs to match the deployed HTTPS domain. Configure Vonage and OpenAI credentials for the same environment.

## Database and start commands

```bash
npx prisma migrate deploy
npm run build
npm start
```

Configure a scheduler to call `/api/cron/reminders` with `Authorization: Bearer <CRON_SECRET>` at the desired interval. The endpoint is not intended for browser polling.

## Verification

After deployment, verify sign-in, doctor and patient dashboards, appointment booking, video authorization, AI assistance, and authenticated reminder processing. Confirm that logs contain no secret values and that invalid cron credentials receive `401`.
