const RAZORPAY_MODES = Object.freeze({
  test: { keyPrefix: "rzp_test_", webhookSecretName: "RAZORPAY_TEST_WEBHOOK_SECRET" },
  live: { keyPrefix: "rzp_live_", webhookSecretName: "RAZORPAY_LIVE_WEBHOOK_SECRET" },
});

function invalidConfiguration(diagnosticCode) {
  return Object.assign(new Error("Razorpay configuration is invalid"), { diagnosticCode });
}

function resolveModeAndKeyId(env) {
  const mode = env.RAZORPAY_MODE || "test";
  const modeConfig = RAZORPAY_MODES[mode];
  if (!modeConfig) throw invalidConfiguration("CONFIG_MODE_INVALID");

  const keyId = env.RAZORPAY_KEY_ID;
  if (typeof keyId !== "string" || !keyId) throw invalidConfiguration("CONFIG_KEY_ID_MISSING");
  if (!keyId.startsWith(modeConfig.keyPrefix)) throw invalidConfiguration("CONFIG_KEY_MODE_MISMATCH");
  return { mode, keyId, modeConfig };
}

export function getRazorpayApiConfig(env = process.env) {
  const { mode, keyId } = resolveModeAndKeyId(env);
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (typeof keySecret !== "string" || !keySecret) throw invalidConfiguration("CONFIG_KEY_SECRET_MISSING");
  return { mode, keyId, keySecret };
}

export function getRazorpayWebhookConfig(env = process.env) {
  const { mode, keyId, modeConfig } = resolveModeAndKeyId(env);
  const webhookSecret = env[modeConfig.webhookSecretName];
  if (typeof webhookSecret !== "string" || !webhookSecret) throw invalidConfiguration("CONFIG_WEBHOOK_SECRET_MISSING");
  return { mode, keyId, webhookSecret };
}
