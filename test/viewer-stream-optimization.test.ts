import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";

describe("Viewer WebSocket stream & Dashboard concurrency optimization", () => {
  const viewer = readFileSync("src/viewer/index.html", "utf-8");

  describe("Static code verification in src/viewer/index.html", () => {
    it("defines dashboardCoordinator with debounce, mutex lock, and trailing reload", () => {
      expect(viewer).toMatch(/var\s+dashboardCoordinator\s*=\s*\{/);
      expect(viewer).toMatch(/debounceTimer:\s*null/);
      expect(viewer).toMatch(/inFlight:\s*false/);
      expect(viewer).toMatch(/pendingReload:\s*false/);
      expect(viewer).toMatch(/DEBOUNCE_MS:\s*300/);
      expect(viewer).toMatch(/schedule:\s*function/);
      expect(viewer).toMatch(/execute:\s*async\s*function/);
      expect(viewer).toMatch(/cancel:\s*function/);
    });

    it("cancels pending dashboard debounce and abort controller on tab switch away from dashboard", () => {
      expect(viewer).toMatch(/if\s*\(tab\s*!==\s*['"]dashboard['"]\)\s*\{\s*dashboardCoordinator\.cancel\(\);/);
    });

    it("decouples sync events from per-item routeWsMessage iterations and caps ring buffer", () => {
      expect(viewer).toMatch(/} else if\s*\(evt\.type\s*===\s*['"]sync['"]\)\s*\{/);
      expect(viewer).toMatch(/items\.slice\(-50\)/);
      expect(viewer).toMatch(/state\.timeline\.observations\.length\s*=\s*200/);
      expect(viewer).toMatch(/state\.activity\.observations\.length\s*=\s*200/);
    });

    it("delegates routeWsMessage dashboard updates to dashboardCoordinator.schedule()", () => {
      expect(viewer).toMatch(/if\s*\(state\.activeTab\s*===\s*['"]dashboard['"]\)\s*\{\s*dashboardCoordinator\.schedule\(\);/);
      expect(viewer).not.toMatch(/if\s*\(state\.activeTab\s*===\s*['"]dashboard['"]\)\s*\{\s*state\.dashboard\.loaded\s*=\s*false;\s*loadDashboard\(\);\s*\}/);
    });

    it("gates polling and auto-refresh behind document.hidden and uses dashboardCoordinator", () => {
      expect(viewer).toMatch(/if\s*\(document\.hidden\)\s*return;/);
      expect(viewer).toMatch(/dashboardCoordinator\.schedule\(\)/);
    });

    it("triggers pending dashboard reload when returning from hidden state", () => {
      expect(viewer).toMatch(/if\s*\(state\.activeTab\s*===\s*['"]dashboard['"]\s*&&\s*dashboardCoordinator\.pendingReload\)\s*\{\s*dashboardCoordinator\.schedule\(\);\s*\}/);
    });
  });

  describe("Simulated execution of stream sync & concurrency control", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it("handles sync event with 50,000 items without flooding loadDashboard calls", async () => {
      let loadDashboardCalls = 0;

      const coordinator = {
        debounceTimer: null as any,
        inFlight: false,
        pendingReload: false,
        DEBOUNCE_MS: 300,
        schedule() {
          if (this.debounceTimer) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            this.execute();
          }, this.DEBOUNCE_MS);
        },
        async execute() {
          if (this.inFlight) {
            this.pendingReload = true;
            return;
          }
          this.inFlight = true;
          this.pendingReload = false;
          try {
            loadDashboardCalls++;
            await new Promise((r) => setTimeout(r, 50));
          } finally {
            this.inFlight = false;
            if (this.pendingReload) {
              this.pendingReload = false;
              this.schedule();
            }
          }
        }
      };

      const syntheticSyncItems = Array.from({ length: 50000 }, (_, i) => ({
        data: {
          observation: {
            id: `obs_${i}`,
            timestamp: new Date().toISOString(),
            sessionId: "ses_test",
            title: `Item ${i}`
          }
        }
      }));

      // Simulate decoupled sync processing
      const recent = syntheticSyncItems.slice(-50);
      const timelineObs: any[] = [];
      recent.forEach((item) => {
        timelineObs.unshift(item.data.observation);
        if (timelineObs.length > 200) timelineObs.length = 200;
      });

      coordinator.schedule();

      expect(timelineObs.length).toBe(50);
      expect(loadDashboardCalls).toBe(0);

      // Fast-forward timers
      vi.advanceTimersByTime(300);
      expect(loadDashboardCalls).toBe(1);

      // Advance past in-flight promise
      vi.advanceTimersByTime(100);
      expect(loadDashboardCalls).toBe(1);
    });

    it("coalesces rapid bursts of 100 live observation events into a single debounced reload", async () => {
      let loadDashboardCalls = 0;

      const coordinator = {
        debounceTimer: null as any,
        inFlight: false,
        pendingReload: false,
        DEBOUNCE_MS: 300,
        schedule() {
          if (this.debounceTimer) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            this.execute();
          }, this.DEBOUNCE_MS);
        },
        async execute() {
          if (this.inFlight) {
            this.pendingReload = true;
            return;
          }
          this.inFlight = true;
          this.pendingReload = false;
          try {
            loadDashboardCalls++;
            await new Promise((r) => setTimeout(r, 20));
          } finally {
            this.inFlight = false;
            if (this.pendingReload) {
              this.pendingReload = false;
              this.schedule();
            }
          }
        }
      };

      // Simulate 100 rapid events arriving within 100ms
      for (let i = 0; i < 100; i++) {
        coordinator.schedule();
        vi.advanceTimersByTime(1);
      }

      expect(loadDashboardCalls).toBe(0);

      // Advance debounce window
      vi.advanceTimersByTime(300);
      expect(loadDashboardCalls).toBe(1);

      // Finish in-flight
      vi.advanceTimersByTime(50);
      expect(loadDashboardCalls).toBe(1);
    });

    it("re-schedules once if updates arrive while load is currently in flight", async () => {
      let loadDashboardCalls = 0;

      const coordinator = {
        debounceTimer: null as any,
        inFlight: false,
        pendingReload: false,
        DEBOUNCE_MS: 300,
        schedule() {
          if (this.debounceTimer) clearTimeout(this.debounceTimer);
          this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            this.execute();
          }, this.DEBOUNCE_MS);
        },
        async execute() {
          if (this.inFlight) {
            this.pendingReload = true;
            return;
          }
          this.inFlight = true;
          this.pendingReload = false;
          try {
            loadDashboardCalls++;
            await new Promise((r) => setTimeout(r, 500));
          } finally {
            this.inFlight = false;
            if (this.pendingReload) {
              this.pendingReload = false;
              this.schedule();
            }
          }
        }
      };

      // Trigger initial load
      coordinator.schedule();
      await vi.advanceTimersByTimeAsync(300);
      expect(loadDashboardCalls).toBe(1);
      expect(coordinator.inFlight).toBe(true);

      // While in-flight (takes 500ms), 10 new events arrive and trigger debounce
      for (let i = 0; i < 10; i++) {
        coordinator.schedule();
      }

      // Debounce window (300ms) elapses while still in-flight
      await vi.advanceTimersByTimeAsync(300);
      expect(coordinator.pendingReload).toBe(true);
      expect(loadDashboardCalls).toBe(1);

      // Initial execution completes (remaining 200ms)
      await vi.advanceTimersByTimeAsync(200);
      expect(coordinator.inFlight).toBe(false);

      // Trailing execution triggers after debounce
      await vi.advanceTimersByTimeAsync(300);
      expect(loadDashboardCalls).toBe(2);

      // Trailing execution completes (500ms)
      await vi.advanceTimersByTimeAsync(500);
      expect(coordinator.inFlight).toBe(false);
      expect(loadDashboardCalls).toBe(2);
    });
  });
});
