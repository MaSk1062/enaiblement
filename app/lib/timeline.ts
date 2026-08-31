/**
 * Turns a roadmap phase's free-text `duration` into lane geometry a CSS grid can place.
 *
 * The Project Manager's prompt (`app/agents/prompts/roadmap.md`) asks for exactly three
 * phases shaped like "Weeks 1-4", "Weeks 5-12", "Month 4+" - but it is still a model
 * generating prose, not a schema, and a duration phrased slightly differently is a live-demo
 * risk, not a hypothetical. Every phase gets a lane no matter what the string says: a phase
 * that fails to parse falls in line right after whichever phase came before it, rather than
 * disappearing or crashing the Canvas.
 */

export interface DurationSpan {
  startWeek: number;
  endWeek: number;
  /** No end was stated ("Month 4+") - the lane fades out rather than closing off. */
  open: boolean;
}

export interface TimelineLane extends DurationSpan {
  phaseName: string;
}

export interface Timeline {
  lanes: TimelineLane[];
  /** The week ruler needs to span at least this far. */
  totalWeeks: number;
}

/** Visual width given to a lane that has no stated end, or no parseable duration at all. */
const FALLBACK_SPAN_WEEKS = 4;

const monthStartWeek = (month: number) => (month - 1) * 4 + 1;
const monthEndWeek = (month: number) => month * 4;

/** Returns null when the string carries no recognisable week/month figure. */
export function parseDuration(duration: string): DurationSpan | null {
  const s = duration.trim();

  let m = s.match(/weeks?\s*(\d+)\s*[-–-]\s*(\d+)/i);
  if (m) return { startWeek: Number(m[1]), endWeek: Number(m[2]), open: false };

  m = s.match(/weeks?\s*(\d+)\s*\+/i);
  if (m) {
    const startWeek = Number(m[1]);
    return { startWeek, endWeek: startWeek + FALLBACK_SPAN_WEEKS - 1, open: true };
  }

  m = s.match(/weeks?\s*(\d+)\b/i);
  if (m) {
    const week = Number(m[1]);
    return { startWeek: week, endWeek: week, open: false };
  }

  m = s.match(/months?\s*(\d+)\s*[-–-]\s*(\d+)/i);
  if (m) return { startWeek: monthStartWeek(Number(m[1])), endWeek: monthEndWeek(Number(m[2])), open: false };

  m = s.match(/months?\s*(\d+)\s*\+/i);
  if (m) {
    const startWeek = monthStartWeek(Number(m[1]));
    return { startWeek, endWeek: startWeek + FALLBACK_SPAN_WEEKS - 1, open: true };
  }

  m = s.match(/months?\s*(\d+)\b/i);
  if (m) {
    const month = Number(m[1]);
    return { startWeek: monthStartWeek(month), endWeek: monthEndWeek(month), open: false };
  }

  return null;
}

export function buildTimeline(phases: { phaseName: string; duration: string }[]): Timeline {
  let cursor = 1;

  const lanes: TimelineLane[] = phases.map((phase) => {
    const span = parseDuration(phase.duration) ?? {
      startWeek: cursor,
      endWeek: cursor + FALLBACK_SPAN_WEEKS - 1,
      open: false,
    };
    cursor = Math.max(cursor, span.endWeek + 1);
    return { phaseName: phase.phaseName, ...span };
  });

  const totalWeeks = lanes.reduce((max, lane) => Math.max(max, lane.endWeek), 1);
  return { lanes, totalWeeks };
}
