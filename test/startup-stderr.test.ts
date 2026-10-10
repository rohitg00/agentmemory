import { describe, expect, it } from "vitest";
import { createStartupStderrCapture } from "../src/cli/startup-stderr.js";

describe("startup stderr capture", () => {
  it("exposes bounded stderr before the child process exits", () => {
    const capture = createStartupStderrCapture(5);

    capture.append(Buffer.from("abc"));
    capture.append(Buffer.from("def"));

    expect(capture.text()).toBe("abcde");
  });
});
