"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import type { OrgRole } from "@prisma/client";
import type { TourId, ActiveTour, TourStep } from "@/lib/tours/types";
import { TOURS, ALL_TOUR_IDS } from "@/lib/tours/registry";
import {
  startTour,
  nextStep as engineNext,
  prevStep as enginePrev,
  getCurrentStep,
  isLastStep,
  isFirstStep,
  persistProgress,
  persistCompletion,
  persistSkip,
  persistDismissal,
  waitForTarget,
  scrollIntoView,
  getEligibleTours,
} from "@/lib/tours/tour-engine";
import { resetAllTours, getTourState } from "@/lib/tours/tour-storage";

interface TourContextValue {
  activeTour: ActiveTour | null;
  currentStep: TourStep | null;
  targetEl: HTMLElement | null;
  isFirst: boolean;
  isLast: boolean;
  totalSteps: number;
  currentIndex: number;
  dontShowAgain: boolean;
  targetMissing: boolean;

  start: (tourId: TourId) => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  complete: () => void;
  dismiss: () => void;
  resetTours: () => void;
  setDontShowAgain: (v: boolean) => void;

  availableTours: TourId[];
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used within TourProvider");
  return ctx;
}

export function useTourSafe() {
  return useContext(TourContext);
}

interface TourProviderProps {
  children: ReactNode;
  userId: string;
  orgId: string;
  role: OrgRole;
}

export function TourProvider({ children, userId, orgId, role }: TourProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeTour, setActiveTour] = useState<ActiveTour | null>(null);
  const [targetEl, setTargetEl] = useState<HTMLElement | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [mounted, setMounted] = useState(false);
  const autoStartAttempted = useRef(false);
  const navigatingRef = useRef(false);
  const skippingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resolveTarget = useCallback(async (step: TourStep) => {
    setTargetEl(null);
    setTargetMissing(false);

    if (step.action) {
      try {
        await step.action();
      } catch {}
    }

    const el = await waitForTarget(step.target);
    if (el) {
      scrollIntoView(el);
      setTargetEl(el);
      setTargetMissing(false);
    } else {
      if (skippingRef.current) return;
      skippingRef.current = true;
      setActiveTour((prev) => {
        if (!prev) { skippingRef.current = false; return null; }
        const filtered = prev.resolvedSteps.filter((s) => s.id !== step.id);
        if (filtered.length === 0) {
          skippingRef.current = false;
          persistCompletion(userId, orgId, prev.tourId);
          setTargetEl(null);
          return null;
        }
        const idx = Math.min(prev.currentStepIndex, filtered.length - 1);
        return { ...prev, resolvedSteps: filtered, currentStepIndex: idx };
      });
    }
  }, [userId, orgId]);

  const handleStart = useCallback(
    (tourId: TourId) => {
      const def = TOURS[tourId];
      if (!def) return;

      const state = getTourState(userId, orgId, tourId);
      const resumeStep =
        state.status === "in_progress" ? state.currentStep : undefined;

      const active = startTour(def, role, resumeStep);
      if (!active) return;

      setDontShowAgain(false);
      setActiveTour(active);

      const step = getCurrentStep(active);
      if (step?.route && pathname !== step.route) {
        navigatingRef.current = true;
        router.push(step.route);
      } else if (step) {
        resolveTarget(step);
      }

      persistProgress(userId, orgId, active);
    },
    [userId, orgId, role, pathname, router, resolveTarget]
  );

  useEffect(() => {
    if (!activeTour || !navigatingRef.current) return;
    navigatingRef.current = false;

    const step = getCurrentStep(activeTour);
    if (step) {
      const timer = setTimeout(() => resolveTarget(step), 300);
      return () => clearTimeout(timer);
    }
  }, [pathname, activeTour, resolveTarget]);

  useEffect(() => {
    if (!skippingRef.current || !activeTour) return;
    skippingRef.current = false;
    const step = getCurrentStep(activeTour);
    if (!step) return;
    if (step.route && pathname !== step.route) {
      navigatingRef.current = true;
      router.push(step.route);
    } else {
      resolveTarget(step);
    }
  }, [activeTour, pathname, router, resolveTarget]);

  const handleNext = useCallback(() => {
    if (!activeTour) return;

    if (isLastStep(activeTour)) {
      if (dontShowAgain) {
        persistDismissal(userId, orgId, activeTour.tourId);
      } else {
        persistCompletion(userId, orgId, activeTour.tourId);
      }
      setActiveTour(null);
      setTargetEl(null);
      setTargetMissing(false);
      return;
    }

    const next = engineNext(activeTour);
    if (!next) {
      persistCompletion(userId, orgId, activeTour.tourId);
      setActiveTour(null);
      setTargetEl(null);
      return;
    }

    setActiveTour(next);
    persistProgress(userId, orgId, next);

    const step = getCurrentStep(next);
    if (step?.route && pathname !== step.route) {
      navigatingRef.current = true;
      router.push(step.route);
    } else if (step) {
      resolveTarget(step);
    }
  }, [activeTour, userId, orgId, dontShowAgain, pathname, router, resolveTarget]);

  const handleBack = useCallback(() => {
    if (!activeTour) return;

    const prev = enginePrev(activeTour);
    setActiveTour(prev);
    persistProgress(userId, orgId, prev);

    const step = getCurrentStep(prev);
    if (step?.route && pathname !== step.route) {
      navigatingRef.current = true;
      router.push(step.route);
    } else if (step) {
      resolveTarget(step);
    }
  }, [activeTour, userId, orgId, pathname, router, resolveTarget]);

  const handleSkip = useCallback(() => {
    if (!activeTour) return;
    if (dontShowAgain) {
      persistDismissal(userId, orgId, activeTour.tourId);
    } else {
      persistSkip(userId, orgId, activeTour.tourId);
    }
    setActiveTour(null);
    setTargetEl(null);
    setTargetMissing(false);
  }, [activeTour, userId, orgId, dontShowAgain]);

  const handleComplete = useCallback(() => {
    if (!activeTour) return;
    if (dontShowAgain) {
      persistDismissal(userId, orgId, activeTour.tourId);
    } else {
      persistCompletion(userId, orgId, activeTour.tourId);
    }
    setActiveTour(null);
    setTargetEl(null);
    setTargetMissing(false);
  }, [activeTour, userId, orgId, dontShowAgain]);

  const handleDismiss = useCallback(() => {
    if (!activeTour) return;
    persistDismissal(userId, orgId, activeTour.tourId);
    setActiveTour(null);
    setTargetEl(null);
    setTargetMissing(false);
  }, [activeTour, userId, orgId]);

  const handleReset = useCallback(() => {
    resetAllTours(userId, orgId);
    autoStartAttempted.current = false;
  }, [userId, orgId]);

  const availableTours = mounted
    ? getEligibleTours(TOURS, role, userId, orgId).map((t) => t.tourId)
    : [];

  useEffect(() => {
    if (!mounted || autoStartAttempted.current || activeTour) return;
    autoStartAttempted.current = true;

    const eligible = getEligibleTours(TOURS, role, userId, orgId);
    const autoStartable = eligible.find(
      (t) => t.canAutoStart || t.canResumeFromStep !== null
    );

    if (autoStartable) {
      const timer = setTimeout(() => handleStart(autoStartable.tourId), 1500);
      return () => clearTimeout(timer);
    }
  }, [mounted, role, userId, orgId, activeTour, handleStart]);

  useEffect(() => {
    if (!activeTour) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleSkip();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTour, handleSkip]);

  const step = activeTour ? getCurrentStep(activeTour) : null;

  const value: TourContextValue = {
    activeTour,
    currentStep: step,
    targetEl,
    isFirst: activeTour ? isFirstStep(activeTour) : true,
    isLast: activeTour ? isLastStep(activeTour) : true,
    totalSteps: activeTour ? activeTour.resolvedSteps.length : 0,
    currentIndex: activeTour ? activeTour.currentStepIndex : 0,
    dontShowAgain,
    targetMissing,

    start: handleStart,
    next: handleNext,
    back: handleBack,
    skip: handleSkip,
    complete: handleComplete,
    dismiss: handleDismiss,
    resetTours: handleReset,
    setDontShowAgain,

    availableTours,
  };

  return (
    <TourContext.Provider value={value}>
      {children}
    </TourContext.Provider>
  );
}
