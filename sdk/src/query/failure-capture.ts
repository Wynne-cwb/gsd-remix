import { GSDError, ErrorClassification } from '../errors.js';
import { promoteFailureMemory, recordPhaseArtifactFailureEvents, runFailurePreflight, type FailureEvent } from '../failure-memory.js';
import { normalizePhaseName } from './helpers.js';
import type { QueryHandler } from './utils.js';

function countByKind(events: FailureEvent[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const event of events) {
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  }
  return counts;
}

export const failureCapturePhase: QueryHandler = async (args, projectDir) => {
  const rawPhase = args[0];
  if (!rawPhase) {
    throw new GSDError('phase number required for failure.capture-phase', ErrorClassification.Validation);
  }

  const phaseNumber = normalizePhaseName(rawPhase);
  const events = await recordPhaseArtifactFailureEvents(projectDir, { phaseNumber });

  return {
    data: {
      phase: phaseNumber,
      captured: events.length,
      counts: countByKind(events),
      events_path: '.planning/failure-memory/events.jsonl',
    },
  };
};

export const failurePromotePhase: QueryHandler = async (args, projectDir) => {
  const rawPhase = args[0];
  if (!rawPhase) {
    throw new GSDError('phase number required for failure.promote-phase', ErrorClassification.Validation);
  }

  const phaseNumber = normalizePhaseName(rawPhase);
  const result = await promoteFailureMemory(projectDir, phaseNumber);

  return {
    data: {
      phase: phaseNumber,
      entries: result.index.entries.length,
      touched_entry_ids: result.touched_entry_ids,
      promoted_entry_ids: result.promoted_entry_ids,
      candidate_entry_ids: result.candidate_entry_ids,
      index_path: '.planning/failure-memory/index.json',
      overview_path: '.planning/FAILURE-MEMORY.md',
    },
  };
};

export const failurePreflight: QueryHandler = async (_args, projectDir) => {
  const result = await runFailurePreflight(projectDir);
  return { data: result };
};
