import { db } from "@/lib/prisma";
import { createRazorpayWebhookHandler } from "@/lib/razorpay-webhook.mjs";
import { getRazorpayWebhookConfig } from "@/lib/razorpay-config.mjs";

export const runtime = "nodejs";

export async function POST(request) {
  let configuration;
  try {
    configuration = getRazorpayWebhookConfig();
  } catch {
    return Response.json({ error: "Webhook unavailable" }, { status: 503 });
  }
  return createRazorpayWebhookHandler({ db, ...configuration })(request);
}
