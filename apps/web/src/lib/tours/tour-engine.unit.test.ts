import { describe, it, expect, beforeEach, vi } from "vitest";
import type { TourDefinition, ActiveTour } from "./types";
import {
  resolveStepsForRole,
  isTourEligible,
  startTour,
  nextStep,
  prevStep,
  getCurrentStep,
  isLastStep,
  isFirstStep,
} from "./tour-engine";

const MOCK_TOUR: TourDefinition = {
  id: "dashboard_admin",
  title: "Admin Tour",
  description: "Test tour",
  rolesAllowed: ["ADMIN"],
  autoStart: true,
  steps: [
    { id: "step1", target: "el.one", title: "Step 1", body: "First step", placement: "bottom" },
    { id: "step2", target: "el.two", title: "Step 2", body: "Second step", placement: "right" },
    { id: "step3", target: "el.three", title: "Step 3", body: "Third step", placement: "top", rolesAllowed: ["ADMIN"] },
    { id: "step4", target: "el.four", title: "Step 4", body: "Staff only", placement: "left", rolesAllowed: ["STAFF"] },
  ],
};

describe("resolveStepsForRole", () => {
  it("filters out steps not allowed for role", () => {
    const steps = resolveStepsForRole(MOCK_TOUR.steps, "ADMIN");
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.id)).toEqual(["step1", "step2", "step3"]);
  });

  it("includes role-unrestricted steps for any role", () => {
    const steps = resolveStepsForRole(MOCK_TOUR.steps, "STAFF");
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.id)).toEqual(["step1", "step2", "step4"]);
  });

  it("filters steps with failing guard", () => {
    const steps = resolveStepsForRole(
      [
        ...MOCK_TOUR.steps.slice(0, 2),
        { ...MOCK_TOUR.steps[2], guard: () => false },
      ],
      "ADMIN"
    );
    expect(steps).toHaveLength(2);
  });
});

describe("isTourEligible", () => {
  it("returns true when role is allowed", () => {
    expect(isTourEligible(MOCK_TOUR, "ADMIN")).toBe(true);
  });

  it("returns false when role is not allowed", () => {
    expect(isTourEligible(MOCK_TOUR, "STAFF")).toBe(false);
  });
});

describe("startTour", () => {
  it("starts at step 0 by default", () => {
    const active = startTour(MOCK_TOUR, "ADMIN");
    expect(active).not.toBeNull();
    expect(active!.currentStepIndex).toBe(0);
    expect(active!.resolvedSteps).toHaveLength(3);
  });

  it("resumes at given step index", () => {
    const active = startTour(MOCK_TOUR, "ADMIN", 2);
    expect(active).not.toBeNull();
    expect(active!.currentStepIndex).toBe(2);
  });

  it("clamps resume step to max index", () => {
    const active = startTour(MOCK_TOUR, "ADMIN", 99);
    expect(active).not.toBeNull();
    expect(active!.currentStepIndex).toBe(2);
  });

  it("returns null when no steps match role", () => {
    const tour: TourDefinition = {
      ...MOCK_TOUR,
      steps: [{ id: "only-staff", target: "x", title: "T", body: "B", rolesAllowed: ["STAFF"] }],
    };
    const active = startTour(tour, "ADMIN");
    expect(active).toBeNull();
  });
});

describe("navigation", () => {
  let active: ActiveTour;

  beforeEach(() => {
    active = startTour(MOCK_TOUR, "ADMIN")!;
  });

  it("nextStep advances index", () => {
    const next = nextStep(active);
    expect(next).not.toBeNull();
    expect(next!.currentStepIndex).toBe(1);
  });

  it("nextStep returns null at last step", () => {
    active = { ...active, currentStepIndex: 2 };
    const next = nextStep(active);
    expect(next).toBeNull();
  });

  it("prevStep goes back", () => {
    active = { ...active, currentStepIndex: 2 };
    const prev = prevStep(active);
    expect(prev.currentStepIndex).toBe(1);
  });

  it("prevStep clamps to 0", () => {
    const prev = prevStep(active);
    expect(prev.currentStepIndex).toBe(0);
  });

  it("getCurrentStep returns correct step", () => {
    const step = getCurrentStep(active);
    expect(step?.id).toBe("step1");

    active = { ...active, currentStepIndex: 1 };
    expect(getCurrentStep(active)?.id).toBe("step2");
  });

  it("isFirstStep / isLastStep", () => {
    expect(isFirstStep(active)).toBe(true);
    expect(isLastStep(active)).toBe(false);

    active = { ...active, currentStepIndex: 2 };
    expect(isFirstStep(active)).toBe(false);
    expect(isLastStep(active)).toBe(true);
  });
});
