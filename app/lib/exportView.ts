/**
 * What the printed/exported strategy shows, versus what the live Canvas shows.
 *
 * The Canvas is a working document — every use case, at whatever status, stays visible so a
 * decision can be revisited. The export is the artifact a CTO forwards, not the audit log of
 * how it got made: approved use cases carry the strategy, rejected ones are worth a one-line
 * record that they were considered, and anything never decided on isn't part of the story.
 */

import type { UseCase } from "../types.ts";

export interface ExportUseCases {
  approved: UseCase[];
  consideredNotPursued: UseCase[];
}

export function selectExportUseCases(useCases: UseCase[]): ExportUseCases {
  return {
    approved: useCases.filter((uc) => uc.status === "approved"),
    consideredNotPursued: useCases.filter((uc) => uc.status === "rejected"),
  };
}
