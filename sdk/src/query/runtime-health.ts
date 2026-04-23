import { runRuntimeHealth } from '../runtime-health.js';
import type { QueryHandler } from './utils.js';

export const runtimeHealth: QueryHandler = async (_args, projectDir) => {
  const result = await runRuntimeHealth(projectDir);
  return { data: result };
};
