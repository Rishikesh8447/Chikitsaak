const { test } = require("node:test");
const assert = require("node:assert/strict");

const configModule = import("../lib/razorpay-config.mjs");

test("Razorpay configuration defaults to test mode and requires matching test credentials", async () => {
  const { getRazorpayApiConfig, getRazorpayWebhookConfig } = await configModule;
  const env = {
    RAZORPAY_KEY_ID: "rzp_test_public",
    RAZORPAY_KEY_SECRET: "test-api-secret",
    RAZORPAY_TEST_WEBHOOK_SECRET: "test-webhook-secret",
    RAZORPAY_LIVE_WEBHOOK_SECRET: "must-not-be-selected",
  };

  assert.deepEqual(getRazorpayApiConfig(env), { mode: "test", keyId: "rzp_test_public", keySecret: "test-api-secret" });
  assert.deepEqual(getRazorpayWebhookConfig(env), { mode: "test", keyId: "rzp_test_public", webhookSecret: "test-webhook-secret" });
});

test("live mode is explicit and requires live-prefixed API keys and its own webhook secret", async () => {
  const { getRazorpayApiConfig, getRazorpayWebhookConfig } = await configModule;
  const env = {
    RAZORPAY_MODE: "live",
    RAZORPAY_KEY_ID: "rzp_live_public",
    RAZORPAY_KEY_SECRET: "live-api-secret",
    RAZORPAY_TEST_WEBHOOK_SECRET: "test-webhook-secret",
    RAZORPAY_LIVE_WEBHOOK_SECRET: "live-webhook-secret",
  };

  assert.equal(getRazorpayApiConfig(env).mode, "live");
  assert.equal(getRazorpayWebhookConfig(env).webhookSecret, "live-webhook-secret");
  assert.throws(() => getRazorpayApiConfig({ ...env, RAZORPAY_MODE: "test" }), (error) => error.message.includes("configuration is invalid") && error.diagnosticCode === "CONFIG_KEY_MODE_MISMATCH");
  assert.throws(() => getRazorpayWebhookConfig({ ...env, RAZORPAY_LIVE_WEBHOOK_SECRET: undefined }), /configuration is invalid/);
});

test("invalid modes and missing selected-mode credentials fail closed without cross-mode fallback", async () => {
  const { getRazorpayApiConfig, getRazorpayWebhookConfig } = await configModule;
  assert.throws(() => getRazorpayApiConfig({ RAZORPAY_MODE: "production", RAZORPAY_KEY_ID: "rzp_live_key", RAZORPAY_KEY_SECRET: "secret" }), (error) => error.message.includes("configuration is invalid") && error.diagnosticCode === "CONFIG_MODE_INVALID");
  assert.throws(() => getRazorpayApiConfig({ RAZORPAY_KEY_ID: "rzp_test_key" }), (error) => error.message.includes("configuration is invalid") && error.diagnosticCode === "CONFIG_KEY_SECRET_MISSING");
  assert.throws(() => getRazorpayApiConfig({}), (error) => error.message.includes("configuration is invalid") && error.diagnosticCode === "CONFIG_KEY_ID_MISSING");
  assert.throws(() => getRazorpayWebhookConfig({ RAZORPAY_KEY_ID: "rzp_test_key", RAZORPAY_LIVE_WEBHOOK_SECRET: "live-secret" }), /configuration is invalid/);
});
