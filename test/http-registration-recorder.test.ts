import { describe, expect, it } from "vitest";
import { createHttpRegistrationRecorder } from "./helpers/http-registrations.js";

describe("HTTP registration recorder", () => {
  it("retains whole trigger config and observer source, target and options in call order", () => {
    const capture = createHttpRegistrationRecorder();
    const trigger = {
      type: "http", function_id: "api::first",
      config: { api_path: "/first", http_method: "POST", middleware_function_ids: ["auth"], public_webhook: true },
    };
    const source = {
      function_id: "http::on-request",
      args: { method: "GET", path: "/second", middleware_function_ids: ["auth"], public_webhook: true },
    };
    const options = { id: "agentmemory:route:GET /second", max_in_flight: 1024 };
    capture.recordTrigger(trigger);
    capture.recordObserver(source, "api::second", options);
    trigger.config.middleware_function_ids.push("later");
    source.args.public_webhook = false;
    options.max_in_flight = 1;
    const expected = [
      { transport: "trigger", registration: { type: "http", function_id: "api::first",
        config: { api_path: "/first", http_method: "POST", middleware_function_ids: ["auth"], public_webhook: true } } },
      { transport: "observer", source: { function_id: "http::on-request",
        args: { method: "GET", path: "/second", middleware_function_ids: ["auth"], public_webhook: true } },
        target: "api::second", options: { id: "agentmemory:route:GET /second", max_in_flight: 1024 } },
    ];
    const snapshot = capture.snapshot();
    expect(snapshot).toEqual(expected);
    snapshot.reverse();
    expect(capture.snapshot()).toEqual(expected);
  });

  it("ignores non-HTTP registrations and refuses an empty inventory", () => {
    const capture = createHttpRegistrationRecorder();
    capture.recordTrigger({ type: "state", function_id: "events::state", config: { scope: "mem:test" } });
    capture.recordObserver({ function_id: "state::set", args: { scope: "mem:test" } }, "events::state");
    expect(() => capture.snapshot()).toThrow("No HTTP registrations captured");
  });

  it("rejects duplicate method/path pairs across registration transports without deduplication", () => {
    const capture = createHttpRegistrationRecorder();
    capture.recordTrigger({ type: "http", function_id: "api::first", config: { api_path: "/same" } });
    capture.recordObserver({ function_id: "http::on-request", args: { method: "get", path: "/same" } }, "api::second");
    expect(() => capture.snapshot()).toThrow('Duplicate HTTP registration: ["GET","/same"]');
  });

  it("rejects an incomplete HTTP registration instead of losing it from the inventory", () => {
    const capture = createHttpRegistrationRecorder();
    capture.recordObserver({ function_id: "http::on-request", args: { method: "GET" } }, "api::missing-path");
    expect(() => capture.snapshot()).toThrow("Incomplete HTTP registration");
  });
});
