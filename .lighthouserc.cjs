module.exports = {
  ci: {
    collect: {
      startServerCommand: "npm run start -- --hostname 127.0.0.1 --port 3000",
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 120000,
      url: ["http://127.0.0.1:3000/"],
      numberOfRuns: 3,
      settings: {
        chromeFlags: "--no-sandbox",
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["warn", { minScore: 0.5 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["warn", { minScore: 0.8 }],
        "categories:seo": ["warn", { minScore: 0.85 }],

        "aria-valid-attr": ["error", { minScore: 1 }],
        "aria-valid-attr-value": ["error", { minScore: 1 }],
        "button-name": ["error", { minScore: 1 }],
        "image-alt": ["error", { minScore: 1 }],
        "label": ["error", { minScore: 1 }],
        "link-name": ["error", { minScore: 1 }],

        "largest-contentful-paint": ["error", { maxNumericValue: 6000 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.25 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
    },
  },
};
