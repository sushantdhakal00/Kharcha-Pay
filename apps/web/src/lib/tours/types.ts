import type { OrgRole } from "@prisma/client";

export type TourId =
  | "dashboard_admin"
  | "create_request_staff"
  | "approvals_approver"
  | "audit_auditor";

export type TourStatus =
  | "never_started"
  | "in_progress"
  | "completed"
  | "skipped"
  | "dismissed";

export type StepPlacement = "top" | "bottom" | "left" | "right" | "auto";
export type StepAlign = "start" | "center" | "end";

export interface TourStep {
  id: string;
  target: string;
  title: string;
  body: string;
  placement?: StepPlacement;
  align?: StepAlign;
  route?: string;
  rolesAllowed?: OrgRole[];
  requiredAction?: boolean;
  /** If true, skip this step silently when target is missing instead of showing fallback */
  skipIfMissing?: boolean;
  /** Called before step displays — e.g. open a menu, expand sidebar */
  action?: () => void | Promise<void>;
  /** Return false to skip this step */
  guard?: () => boolean;
}

export interface TourDefinition {
  id: TourId;
  title: string;
  description: string;
  rolesAllowed: OrgRole[];
  /** Whether to auto-start on first visit */
  autoStart?: boolean;
  steps: TourStep[];
}

export interface PersistedTourState {
  status: TourStatus;
  currentStep: number;
  updatedAt: number;
}

export interface ActiveTour {
  tourId: TourId;
  definition: TourDefinition;
  currentStepIndex: number;
  /** Filtered steps (after role/guard filtering) */
  resolvedSteps: TourStep[];
}
