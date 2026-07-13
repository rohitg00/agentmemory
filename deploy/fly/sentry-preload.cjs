const Sentry = require("@sentry/node");

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || "production",
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || "0.05"),
    release: process.env.SENTRY_RELEASE,
  });
  console.log("Sentry enabled");
} else {
  console.log("Sentry disabled: SENTRY_DSN not set");
}
