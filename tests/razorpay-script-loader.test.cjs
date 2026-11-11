const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { cwd } = require("node:process");

const loaderSourcePromise = readFile(join(cwd(), "lib", "razorpay-script.js"), "utf8");
const cardSourcePromise = readFile(join(cwd(), "components", "ui", "appointment-card.jsx"), "utf8");

function createFakeDom({ existingScript = null, initialRazorpay = undefined } = {}) {
  const appendedScripts = [];
  const windowObj = {};
  if (initialRazorpay) {
    windowObj.Razorpay = initialRazorpay;
  }

  function makeElement() {
    const listeners = new Map();
    const el = {
      src: "",
      async: false,
      dataset: {},
      removed: false,
      addEventListener: (event, cb) => {
        if (!listeners.has(event)) listeners.set(event, []);
        listeners.get(event).push(cb);
      },
      dispatch: (event) => {
        for (const cb of listeners.get(event) || []) {
          cb();
        }
      },
      remove: () => {
        el.removed = true;
      },
    };
    return el;
  }

  const documentObj = {
    querySelector: () => existingScript,
    createElement: () => makeElement(),
    head: {
      appendChild: (el) => {
        appendedScripts.push(el);
      },
    },
  };

  return { windowObj, documentObj, appendedScripts, makeElement };
}

async function loadRazorpayModule(windowObj, documentObj) {
  const source = await loaderSourcePromise;
  const transformed = source
    .replace("export const RAZORPAY_CHECKOUT_SRC", "const RAZORPAY_CHECKOUT_SRC")
    .replace("export function loadRazorpayScript", "function loadRazorpayScript")
    .concat("\nreturn { RAZORPAY_CHECKOUT_SRC, loadRazorpayScript };");

  return new Function("window", "document", transformed)(windowObj, documentObj);
}

test("loadRazorpayScript deduplicates concurrent calls into a single script element", async () => {
  const { windowObj, documentObj, appendedScripts } = createFakeDom();
  const { loadRazorpayScript, RAZORPAY_CHECKOUT_SRC } = await loadRazorpayModule(windowObj, documentObj);

  const p1 = loadRazorpayScript();
  const p2 = loadRazorpayScript();
  const p3 = loadRazorpayScript();

  assert.equal(p1, p2);
  assert.equal(p2, p3);
  assert.equal(appendedScripts.length, 1);
  assert.equal(appendedScripts[0].src, RAZORPAY_CHECKOUT_SRC);
  assert.equal(appendedScripts[0].async, true);

  windowObj.Razorpay = function MockRazorpay() {};
  appendedScripts[0].dispatch("load");

  const results = await Promise.all([p1, p2, p3]);
  assert.deepEqual(results, [true, true, true]);

  // Subsequent call after load resolves immediately without creating a new script
  assert.equal(await loadRazorpayScript(), true);
  assert.equal(appendedScripts.length, 1);
});

test("loadRazorpayScript resets promise and cleans up failed script tag on error", async () => {
  const { windowObj, documentObj, appendedScripts } = createFakeDom();
  const { loadRazorpayScript } = await loadRazorpayModule(windowObj, documentObj);

  const firstAttempt = loadRazorpayScript();
  assert.equal(appendedScripts.length, 1);
  appendedScripts[0].dispatch("error");

  assert.equal(await firstAttempt, false);
  assert.equal(appendedScripts[0].removed, true);

  const retryAttempt = loadRazorpayScript();
  assert.equal(appendedScripts.length, 2);
  windowObj.Razorpay = function MockRazorpay() {};
  appendedScripts[1].dispatch("load");
  assert.equal(await retryAttempt, true);
});

test("AppointmentCard loads Razorpay via shared loader instead of repeated per-card Script tags", async () => {
  const cardSource = await cardSourcePromise;

  assert.match(cardSource, /import\s*\{\s*loadRazorpayScript\s*\}\s*from\s*"@\/lib\/razorpay-script"/);
  assert.doesNotMatch(cardSource, /<Script\s+src="https:\/\/checkout\.razorpay\.com\/v1\/checkout\.js"/);
  assert.match(cardSource, /loadRazorpayScript\(\)\.then\(/);
});

