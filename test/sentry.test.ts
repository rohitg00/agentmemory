import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const sentryMock = {
  init: vi.fn(),
  isInitialized: vi.fn(),
  captureMessage: vi.fn(),
  captureException: vi.fn(),
  flush: vi.fn(async () => true),
};
vi.mock("@sentry/node", () => sentryMock);

describe("observability/sentry", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    // vi.clearAllMocks() resets call history but NOT a configured
    // mockReturnValue -- set an explicit baseline so isInitialized()'s
    // result never silently carries over from a prior test.
    sentryMock.isInitialized.mockReturnValue(false);
    delete process.env.SENTRY_DSN;
    // Each test needs a fresh module instance because `enabled` is
    // module-level state set by initSentry().
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("initSentry() is a no-op when SENTRY_DSN is unset", async () => {
    const { initSentry, captureFailure } = await import("../src/observability/sentry.js");
    initSentry();
    expect(sentryMock.init).not.toHaveBeenCalled();

    captureFailure("some_code", {});
    expect(sentryMock.captureMessage).not.toHaveBeenCalled();
  });

  it("initSentry() calls Sentry.init() and enables reporting when SENTRY_DSN is set and the SDK initializes", async () => {
    process.env.SENTRY_DSN = "https://key@o0.ingest.sentry.io/1";
    sentryMock.isInitialized.mockReturnValue(true);
    const { initSentry, captureFailure } = await import("../src/observability/sentry.js");

    initSentry();
    expect(sentryMock.init).toHaveBeenCalledTimes(1);

    captureFailure("some_code", { sessionId: "s1" });
    expect(sentryMock.captureMessage).toHaveBeenCalledTimes(1);
  });

  it("initSentry() does not enable reporting when Sentry.init() silently no-ops on a malformed DSN", async () => {
    process.env.SENTRY_DSN = "not-a-valid-dsn";
    sentryMock.isInitialized.mockReturnValue(false);
    const { initSentry, captureFailure, captureException } = await import(
      "../src/observability/sentry.js"
    );

    initSentry();
    expect(sentryMock.init).toHaveBeenCalledTimes(1);

    captureFailure("some_code", {});
    captureException(new Error("boom"), {});
    expect(sentryMock.captureMessage).not.toHaveBeenCalled();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("initSentry() catches and logs a thrown Sentry.init() error without throwing", async () => {
    process.env.SENTRY_DSN = "https://key@o0.ingest.sentry.io/1";
    sentryMock.init.mockImplementationOnce(() => {
      throw new Error("init exploded");
    });
    const { initSentry } = await import("../src/observability/sentry.js");

    expect(() => initSentry()).not.toThrow();
  });

  it("captureFailure() is a no-op before initSentry() has enabled reporting", async () => {
    const { captureFailure } = await import("../src/observability/sentry.js");
    captureFailure("code", { a: 1 });
    expect(sentryMock.captureMessage).not.toHaveBeenCalled();
  });

  it("captureException() truncates an overly long error message before forwarding", async () => {
    process.env.SENTRY_DSN = "https://key@o0.ingest.sentry.io/1";
    sentryMock.isInitialized.mockReturnValue(true);
    const { initSentry, captureException } = await import("../src/observability/sentry.js");
    initSentry();

    const longMessage = "x".repeat(1000);
    captureException(new Error(longMessage), { sessionId: "s1" });

    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    const forwardedErr = sentryMock.captureException.mock.calls[0][0] as Error;
    expect(forwardedErr.message.length).toBeLessThan(longMessage.length);
    expect(forwardedErr.message).toContain("[truncated]");
  });

  it("captureException() and captureFailure() swallow a thrown SDK error and log it instead of throwing", async () => {
    process.env.SENTRY_DSN = "https://key@o0.ingest.sentry.io/1";
    sentryMock.isInitialized.mockReturnValue(true);
    sentryMock.captureException.mockImplementationOnce(() => {
      throw new Error("sdk down");
    });
    sentryMock.captureMessage.mockImplementationOnce(() => {
      throw new Error("sdk down");
    });
    const { initSentry, captureException, captureFailure } = await import(
      "../src/observability/sentry.js"
    );
    initSentry();

    expect(() => captureException(new Error("boom"), {})).not.toThrow();
    expect(() => captureFailure("code", {})).not.toThrow();
  });

  it("flushSentry() calls Sentry.flush() only when reporting was enabled", async () => {
    const mod = await import("../src/observability/sentry.js");
    await mod.flushSentry();
    expect(sentryMock.flush).not.toHaveBeenCalled();

    process.env.SENTRY_DSN = "https://key@o0.ingest.sentry.io/1";
    sentryMock.isInitialized.mockReturnValue(true);
    mod.initSentry();
    await mod.flushSentry();
    expect(sentryMock.flush).toHaveBeenCalledTimes(1);
  });
});
