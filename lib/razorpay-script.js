export const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let razorpayLoadPromise = null;

/**
 * Loads Razorpay Checkout at most once across any number of mounted components.
 */
export function loadRazorpayScript() {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(false);
  }

  if (typeof window.Razorpay === "function") {
    return Promise.resolve(true);
  }

  if (razorpayLoadPromise) {
    return razorpayLoadPromise;
  }

  const existingScript = document.querySelector(`script[src="${RAZORPAY_CHECKOUT_SRC}"]`);
  if (existingScript) {
    if (existingScript.dataset.loaded === "true") {
      return Promise.resolve(typeof window.Razorpay === "function");
    }

    razorpayLoadPromise = new Promise((resolve) => {
      existingScript.addEventListener(
        "load",
        () => {
          existingScript.dataset.loaded = "true";
          resolve(typeof window.Razorpay === "function");
        },
        { once: true }
      );
      existingScript.addEventListener(
        "error",
        () => {
          razorpayLoadPromise = null;
          resolve(false);
        },
        { once: true }
      );
    });

    return razorpayLoadPromise;
  }

  razorpayLoadPromise = new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve(typeof window.Razorpay === "function");
      },
      { once: true }
    );
    script.addEventListener(
      "error",
      () => {
        razorpayLoadPromise = null;
        script.remove();
        resolve(false);
      },
      { once: true }
    );
    document.head.appendChild(script);
  });

  return razorpayLoadPromise;
}

