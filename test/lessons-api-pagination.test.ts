import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { registerLessonsFunctions } from "../src/functions/lessons.js";
import { registerApiTriggers } from "../src/triggers/api.js";
import type { Lesson } from "../src/types.js";
import { mockKV, mockSdk } from "./helpers/mocks.js";

describe("Lessons REST pagination", () => {
  let sdk: ReturnType<typeof mockSdk>;
  let kv: ReturnType<typeof mockKV>;

  beforeEach(async () => {
    sdk = mockSdk();
    kv = mockKV();
    registerLessonsFunctions(sdk as never, kv as never);
    registerApiTriggers(sdk as never, kv as never);

    for (const [content, confidence] of [
      ["Lesson A", 0.9],
      ["Lesson B", 0.8],
      ["Lesson C", 0.7],
    ] as const) {
      await sdk.trigger("mem::lesson-save", {
        content,
        confidence,
        project: "agentmemory",
      });
    }
  });

  it("forwards bounded pagination and sort controls", async () => {
    const lessons = await kv.list<Lesson>("mem:lessons");
    for (const lesson of lessons) {
      await kv.set("mem:lessons", lesson.id, {
        ...lesson,
        updatedAt:
          lesson.content === "Lesson A"
            ? "2026-07-20T00:00:00.000Z"
            : lesson.content === "Lesson B"
              ? "2026-07-22T00:00:00.000Z"
              : "2026-07-21T00:00:00.000Z",
      });
    }

    const response = (await sdk.trigger("api::lesson-list", {
      headers: {},
      query_params: {
        project: "agentmemory",
        limit: "2",
        offset: "1",
        sortBy: "recent",
      },
    })) as {
      status_code: number;
      body: {
        lessons: Lesson[];
        total: number;
        limit: number;
        offset: number;
        hasMore: boolean;
      };
    };

    expect(response.status_code).toBe(200);
    expect(response.body.lessons.map((lesson) => lesson.content)).toEqual([
      "Lesson C",
      "Lesson A",
    ]);
    expect(response.body).toMatchObject({
      total: 3,
      limit: 2,
      offset: 1,
      hasMore: false,
    });
  });

  it("accepts an omitted sort order and uses the function default", async () => {
    const response = (await sdk.trigger("api::lesson-list", {
      headers: {},
      query_params: { limit: "2", offset: "0" },
    })) as {
      status_code: number;
      body: {
        success: boolean;
        lessons: Lesson[];
        limit: number;
        offset: number;
      };
    };

    expect(response.status_code).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      limit: 2,
      offset: 0,
    });
    expect(response.body.lessons).toHaveLength(2);
  });

  it.each([
    [{ offset: "-1" }, "invalid numeric parameter: offset"],
    [{ sortBy: "random" }, "sortBy must be confidence or recent"],
  ])("rejects invalid bounded-read parameters", async (queryParams, error) => {
    const response = (await sdk.trigger("api::lesson-list", {
      headers: {},
      query_params: queryParams,
    })) as { status_code: number; body: { error: string } };

    expect(response.status_code).toBe(400);
    expect(response.body.error).toBe(error);
  });
});
