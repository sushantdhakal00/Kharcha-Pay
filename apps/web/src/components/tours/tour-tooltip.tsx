"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useTourSafe } from "./tour-provider";
import type { StepPlacement } from "@/lib/tours/types";

interface Position {
  top: number;
  left: number;
  arrowTop: number;
  arrowLeft: number;
  arrowRotation: string;
  placement: StepPlacement;
}

const TOOLTIP_GAP = 12;
const ARROW_SIZE = 8;
const TOOLTIP_MAX_W = 360;
const TOOLTIP_MIN_W = 280;

function computePosition(
  target: DOMRect,
  tooltip: DOMRect,
  preferred: StepPlacement
): Position {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const placements: StepPlacement[] =
    preferred === "auto"
      ? ["bottom", "top", "right", "left"]
      : [preferred, "bottom", "top", "right", "left"];

  for (const p of placements) {
    const pos = tryPlacement(p, target, tooltip, vw, vh);
    if (pos) return pos;
  }

  return tryPlacement("bottom", target, tooltip, vw, vh, true)!;
}

function tryPlacement(
  p: StepPlacement,
  target: DOMRect,
  tooltip: DOMRect,
  vw: number,
  vh: number,
  force = false
): Position | null {
  let top = 0;
  let left = 0;
  let arrowTop = 0;
  let arrowLeft = 0;
  let arrowRotation = "";

  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;

  switch (p) {
    case "bottom":
      top = target.bottom + TOOLTIP_GAP;
      left = cx - tooltip.width / 2;
      arrowTop = -ARROW_SIZE;
      arrowLeft = tooltip.width / 2 - ARROW_SIZE;
      arrowRotation = "rotate(180deg)";
      break;
    case "top":
      top = target.top - tooltip.height - TOOLTIP_GAP;
      left = cx - tooltip.width / 2;
      arrowTop = tooltip.height - 1;
      arrowLeft = tooltip.width / 2 - ARROW_SIZE;
      arrowRotation = "rotate(0deg)";
      break;
    case "right":
      top = cy - tooltip.height / 2;
      left = target.right + TOOLTIP_GAP;
      arrowTop = tooltip.height / 2 - ARROW_SIZE;
      arrowLeft = -ARROW_SIZE;
      arrowRotation = "rotate(90deg)";
      break;
    case "left":
      top = cy - tooltip.height / 2;
      left = target.left - tooltip.width - TOOLTIP_GAP;
      arrowTop = tooltip.height / 2 - ARROW_SIZE;
      arrowLeft = tooltip.width - 1;
      arrowRotation = "rotate(-90deg)";
      break;
  }

  left = Math.max(8, Math.min(left, vw - tooltip.width - 8));
  top = Math.max(8, Math.min(top, vh - tooltip.height - 8));

  if (!force) {
    if (top < 0 || top + tooltip.height > vh) return null;
    if (left < 0 || left + tooltip.width > vw) return null;
  }

  return { top, left, arrowTop, arrowLeft, arrowRotation, placement: p };
}

function SpotlightOverlay({ target }: { target: DOMRect | null }) {
  if (!target) {
    return (
      <div
        className="fixed inset-0 z-[9998] bg-black/40 transition-opacity duration-200"
        style={{ pointerEvents: "auto" }}
      />
    );
  }

  const pad = 6;
  const r = 8;

  return (
    <svg
      className="fixed inset-0 z-[9998] h-full w-full transition-opacity duration-200"
      style={{ pointerEvents: "auto" }}
    >
      <defs>
        <mask id="tour-spotlight-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <rect
            x={target.left - pad}
            y={target.top - pad}
            width={target.width + pad * 2}
            height={target.height + pad * 2}
            rx={r}
            ry={r}
            fill="black"
          />
        </mask>
      </defs>
      <rect
        x="0"
        y="0"
        width="100%"
        height="100%"
        fill="rgba(0,0,0,0.45)"
        mask="url(#tour-spotlight-mask)"
      />
      <rect
        x={target.left - pad}
        y={target.top - pad}
        width={target.width + pad * 2}
        height={target.height + pad * 2}
        rx={r}
        ry={r}
        fill="none"
        stroke="rgba(99,102,241,0.6)"
        strokeWidth="2"
        className="animate-pulse"
      />
    </svg>
  );
}

export function TourTooltip() {
  const tour = useTourSafe();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);

  const reposition = useCallback(() => {
    if (!tour?.targetEl || !tooltipRef.current) {
      setPos(null);
      setTargetRect(null);
      return;
    }

    const tRect = tour.targetEl.getBoundingClientRect();
    const ttRect = tooltipRef.current.getBoundingClientRect();
    const placement = tour.currentStep?.placement ?? "auto";
    const computed = computePosition(tRect, ttRect, placement);
    setPos(computed);
    setTargetRect(tRect);
  }, [tour?.targetEl, tour?.currentStep?.placement]);

  useEffect(() => {
    if (!tour?.activeTour || !tour?.currentStep) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, [tour?.activeTour, tour?.currentStep]);

  useEffect(() => {
    if (!visible) return;

    const frame = requestAnimationFrame(reposition);
    return () => cancelAnimationFrame(frame);
  }, [visible, reposition, tour?.targetEl]);

  useEffect(() => {
    if (!visible || !tour?.targetEl) return;

    function handleUpdate() {
      requestAnimationFrame(reposition);
    }

    window.addEventListener("resize", handleUpdate);
    window.addEventListener("scroll", handleUpdate, true);
    return () => {
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate, true);
    };
  }, [visible, reposition, tour?.targetEl]);

  useEffect(() => {
    if (!visible || !tooltipRef.current) return;

    const firstFocusable = tooltipRef.current.querySelector<HTMLElement>(
      "button, [tabindex]"
    );
    firstFocusable?.focus();
  }, [visible, pos]);

  if (!tour?.activeTour || !tour.currentStep || !visible) return null;

  return (
    <>
      <SpotlightOverlay target={targetRect} />

      <div
        ref={tooltipRef}
        role="dialog"
        aria-modal="false"
        aria-label={tour.currentStep.title}
        className="fixed z-[9999] animate-in fade-in slide-in-from-bottom-2 duration-200"
        style={{
          top: pos ? `${pos.top}px` : "50%",
          left: pos ? `${pos.left}px` : "50%",
          transform: !pos ? "translate(-50%, -50%)" : undefined,
          maxWidth: `${TOOLTIP_MAX_W}px`,
          minWidth: `${TOOLTIP_MIN_W}px`,
        }}
      >
        <div className="rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          {/* Arrow */}
          {pos && (
            <div
              className="absolute"
              style={{
                top: `${pos.arrowTop}px`,
                left: `${pos.arrowLeft}px`,
                transform: pos.arrowRotation,
              }}
            >
              <svg width={ARROW_SIZE * 2} height={ARROW_SIZE} viewBox="0 0 16 8">
                <path
                  d="M0 8 L8 0 L16 8"
                  fill="white"
                  stroke="rgb(226,232,240)"
                  strokeWidth="1"
                  className="dark:fill-slate-900 dark:stroke-slate-700"
                />
              </svg>
            </div>
          )}

          {/* Header */}
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-4 pb-2 pt-3 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {tour.currentStep.title}
            </h3>
            <button
              type="button"
              onClick={tour.skip}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Close tour"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-3">
            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {tour.currentStep.body}
            </p>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 pb-3 pt-2 dark:border-slate-800">
            <div className="flex items-center gap-3">
              {/* Progress */}
              <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
                {tour.currentIndex + 1} / {tour.totalSteps}
              </span>

              {/* Don't show again */}
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={tour.dontShowAgain}
                  onChange={(e) => tour.setDontShowAgain(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                />
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  Don&apos;t show again
                </span>
              </label>
            </div>

            {/* Navigation buttons */}
            <div className="flex items-center gap-1.5">
              {!tour.isFirst && (
                <button
                  type="button"
                  onClick={tour.back}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={tour.skip}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={tour.next}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:bg-indigo-500 dark:hover:bg-indigo-600"
              >
                {tour.isLast ? "Finish" : "Next"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
