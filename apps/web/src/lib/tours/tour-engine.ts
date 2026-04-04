import type { OrgRole } from "@prisma/client";
import type {
  TourId,
  TourDefinition,
  TourStep,
  ActiveTour,
  PersistedTourState,
} from "./types";
import {
  getTourState,
  updateTourStatus,
  canResume,
  shouldAutoStart,
} from "./tour-storage";

const TARGET_RETRY_INTERVAL = 200;
const TARGET_RETRY_MAX = 2000;

export function resolveStepsForRole(
  steps: TourStep[],
  role: OrgRole
): TourStep[] {
  return steps.filter((step) => {
    if (step.rolesAllowed && !step.rolesAllowed.includes(role)) return false;
    if (step.guard && !step.guard()) return false;
    return true;
  });
}

export function isTourEligible(
  tour: TourDefinition,
  role: OrgRole
): boolean {
  return tour.rolesAllowed.includes(role);
}

export function getEligibleTours(
  tours: Record<TourId, TourDefinition>,
  role: OrgRole,
  userId: string,
  orgId: string
): { tourId: TourId; canAutoStart: boolean; canResumeFromStep: number | null }[] {
  const results: {
    tourId: TourId;
    canAutoStart: boolean;
    canResumeFromStep: number | null;
  }[] = [];

  for (const [id, tour] of Object.entries(tours) as [TourId, TourDefinition][]) {
    if (!isTourEligible(tour, role)) continue;

    const state = getTourState(userId, orgId, id);

    if (state.status === "completed" || state.status === "dismissed" || state.status === "skipped") {
      continue;
    }

    const resumable = canResume(state);
    const autoStart = tour.autoStart !== false && shouldAutoStart(state);

    results.push({
      tourId: id,
      canAutoStart: autoStart,
      canResumeFromStep: resumable ? state.currentStep : null,
    });
  }

  return results;
}

export function startTour(
  tour: TourDefinition,
  role: OrgRole,
  resumeStep?: number
): ActiveTour | null {
  const resolved = resolveStepsForRole(tour.steps, role);
  if (resolved.length === 0) return null;

  const startIndex = resumeStep != null
    ? Math.min(resumeStep, resolved.length - 1)
    : 0;

  return {
    tourId: tour.id,
    definition: tour,
    currentStepIndex: startIndex,
    resolvedSteps: resolved,
  };
}

export function nextStep(active: ActiveTour): ActiveTour | null {
  const next = active.currentStepIndex + 1;
  if (next >= active.resolvedSteps.length) return null;
  return { ...active, currentStepIndex: next };
}

export function prevStep(active: ActiveTour): ActiveTour {
  const prev = Math.max(0, active.currentStepIndex - 1);
  return { ...active, currentStepIndex: prev };
}

export function getCurrentStep(active: ActiveTour): TourStep | null {
  return active.resolvedSteps[active.currentStepIndex] ?? null;
}

export function isLastStep(active: ActiveTour): boolean {
  return active.currentStepIndex >= active.resolvedSteps.length - 1;
}

export function isFirstStep(active: ActiveTour): boolean {
  return active.currentStepIndex === 0;
}

export function persistProgress(
  userId: string,
  orgId: string,
  active: ActiveTour
): void {
  updateTourStatus(userId, orgId, active.tourId, "in_progress", active.currentStepIndex);
}

export function persistCompletion(
  userId: string,
  orgId: string,
  tourId: TourId
): void {
  updateTourStatus(userId, orgId, tourId, "completed");
}

export function persistSkip(
  userId: string,
  orgId: string,
  tourId: TourId
): void {
  updateTourStatus(userId, orgId, tourId, "skipped");
}

export function persistDismissal(
  userId: string,
  orgId: string,
  tourId: TourId
): void {
  updateTourStatus(userId, orgId, tourId, "dismissed");
}

export function findTargetElement(selector: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
}

export function waitForTarget(
  selector: string,
  timeout = TARGET_RETRY_MAX
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const el = findTargetElement(selector);
    if (el) {
      resolve(el);
      return;
    }

    let elapsed = 0;
    const interval = setInterval(() => {
      elapsed += TARGET_RETRY_INTERVAL;
      const found = findTargetElement(selector);
      if (found) {
        clearInterval(interval);
        resolve(found);
      } else if (elapsed >= timeout) {
        clearInterval(interval);
        resolve(null);
      }
    }, TARGET_RETRY_INTERVAL);
  });
}

export function scrollIntoView(el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  const inView =
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight &&
    rect.right <= window.innerWidth;

  if (!inView) {
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }
}
