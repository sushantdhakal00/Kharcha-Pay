import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getTourState,
  setTourState,
  updateTourStatus,
  resetAllTours,
  canResume,
  shouldAutoStart,
} from "./tour-storage";
import type { PersistedTourState } from "./types";

const mockStorage = new Map<string, string>();

const fakeLocalStorage = {
  getItem: (k: string) => mockStorage.get(k) ?? null,
  setItem: (k: string, v: string) => { mockStorage.set(k, v); },
  removeItem: (k: string) => { mockStorage.delete(k); },
  key: (i: number) => Array.from(mockStorage.keys())[i] ?? null,
  get length() {
    return mockStorage.size;
  },
  clear: () => { mockStorage.clear(); },
};

beforeEach(() => {
  mockStorage.clear();
  (globalThis as Record<string, unknown>).localStorage = fakeLocalStorage;
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
});

describe("getTourState", () => {
  it("returns default state when nothing stored", () => {
    const state = getTourState("u1", "o1", "dashboard_admin");
    expect(state).toEqual({
      status: "never_started",
      currentStep: 0,
      updatedAt: 0,
    });
  });

  it("returns persisted state", () => {
    const stored: PersistedTourState = {
      status: "in_progress",
      currentStep: 2,
      updatedAt: 1000,
    };
    mockStorage.set(
      "kharchapay:tours:u1:o1:dashboard_admin",
      JSON.stringify(stored)
    );
    const state = getTourState("u1", "o1", "dashboard_admin");
    expect(state).toEqual(stored);
  });

  it("returns default on corrupt data", () => {
    mockStorage.set("kharchapay:tours:u1:o1:dashboard_admin", "not-json");
    const state = getTourState("u1", "o1", "dashboard_admin");
    expect(state.status).toBe("never_started");
  });
});

describe("setTourState", () => {
  it("writes to localStorage", () => {
    const state: PersistedTourState = {
      status: "completed",
      currentStep: 3,
      updatedAt: 2000,
    };
    setTourState("u1", "o1", "dashboard_admin", state);
    const raw = mockStorage.get("kharchapay:tours:u1:o1:dashboard_admin");
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!)).toEqual(state);
  });
});

describe("updateTourStatus", () => {
  it("updates status and preserves step when not provided", () => {
    setTourState("u1", "o1", "dashboard_admin", {
      status: "in_progress",
      currentStep: 2,
      updatedAt: 1000,
    });
    updateTourStatus("u1", "o1", "dashboard_admin", "completed");
    const state = getTourState("u1", "o1", "dashboard_admin");
    expect(state.status).toBe("completed");
    expect(state.currentStep).toBe(2);
  });

  it("updates both status and step", () => {
    updateTourStatus("u1", "o1", "dashboard_admin", "in_progress", 3);
    const state = getTourState("u1", "o1", "dashboard_admin");
    expect(state.status).toBe("in_progress");
    expect(state.currentStep).toBe(3);
  });
});

describe("resetAllTours", () => {
  it("removes all tours for user+org", () => {
    setTourState("u1", "o1", "dashboard_admin", {
      status: "completed",
      currentStep: 0,
      updatedAt: 1000,
    });
    setTourState("u1", "o1", "create_request_staff", {
      status: "dismissed",
      currentStep: 0,
      updatedAt: 1000,
    });
    mockStorage.set("unrelated_key", "keep");

    resetAllTours("u1", "o1");

    expect(mockStorage.has("kharchapay:tours:u1:o1:dashboard_admin")).toBe(false);
    expect(mockStorage.has("kharchapay:tours:u1:o1:create_request_staff")).toBe(false);
    expect(mockStorage.get("unrelated_key")).toBe("keep");
  });

  it("does not remove tours for different user", () => {
    setTourState("u1", "o1", "dashboard_admin", {
      status: "completed",
      currentStep: 0,
      updatedAt: 1000,
    });
    setTourState("u2", "o1", "dashboard_admin", {
      status: "completed",
      currentStep: 0,
      updatedAt: 1000,
    });

    resetAllTours("u1", "o1");

    expect(mockStorage.has("kharchapay:tours:u1:o1:dashboard_admin")).toBe(false);
    expect(mockStorage.has("kharchapay:tours:u2:o1:dashboard_admin")).toBe(true);
  });
});

describe("canResume", () => {
  it("returns true for in_progress with step > 0", () => {
    expect(canResume({ status: "in_progress", currentStep: 2, updatedAt: 1 })).toBe(true);
  });

  it("returns false for in_progress at step 0", () => {
    expect(canResume({ status: "in_progress", currentStep: 0, updatedAt: 1 })).toBe(false);
  });

  it("returns false for completed", () => {
    expect(canResume({ status: "completed", currentStep: 3, updatedAt: 1 })).toBe(false);
  });

  it("returns false for dismissed", () => {
    expect(canResume({ status: "dismissed", currentStep: 1, updatedAt: 1 })).toBe(false);
  });
});

describe("shouldAutoStart", () => {
  it("returns true for never_started", () => {
    expect(shouldAutoStart({ status: "never_started", currentStep: 0, updatedAt: 0 })).toBe(true);
  });

  it("returns false for any other status", () => {
    expect(shouldAutoStart({ status: "completed", currentStep: 0, updatedAt: 0 })).toBe(false);
    expect(shouldAutoStart({ status: "skipped", currentStep: 0, updatedAt: 0 })).toBe(false);
    expect(shouldAutoStart({ status: "dismissed", currentStep: 0, updatedAt: 0 })).toBe(false);
    expect(shouldAutoStart({ status: "in_progress", currentStep: 0, updatedAt: 0 })).toBe(false);
  });
});
