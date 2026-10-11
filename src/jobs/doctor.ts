import { loadDevice } from '../config/device.js';
import { ingestTarget, type MachineConfig } from '../config/schemas.js';
import { loadSourceManifest } from '../config/source-manifest.js';
import { credentialsExist } from '../connectors/credentials.js';
import { probeSourceWrite } from '../sources/access.js';
import { resolveIngestTarget } from './target.js';

/**
 * Checks for scheduled jobs: lost write access, ingest targets outside a
 * root, and connectors without credentials on the device that runs them.
 */
export async function jobConfigIssues(config: MachineConfig): Promise<readonly string[]> {
  const issues: string[] = [];

  for (const source of config.sources) {
    if (source.access !== 'write') {
      continue;
    }
    const probe = await probeSourceWrite(source);
    if (probe.isErr()) {
      issues.push(`${source.id}: write access lost: ${probe.error.message}`);
    }
  }

  const jobs = config.ingest ?? [];
  if (jobs.length === 0) {
    return issues;
  }

  const device = await loadDevice();
  if (device.isErr()) {
    issues.push(device.error.message);
  }
  const deviceName = device.isOk() ? device.value.name : undefined;

  for (const job of jobs) {
    const source = config.sources.find((entry) => entry.id === job.source);
    if (source !== undefined) {
      const manifest = await loadSourceManifest(source.path);
      if (manifest.isOk()) {
        const target = await resolveIngestTarget(source.path, manifest.value, ingestTarget(job));
        if (target.isErr()) {
          issues.push(`ingest ${job.id}: ${target.error.message}`);
        }
      }
    }
    const runsHere = job.device === undefined || job.device === deviceName;
    if (runsHere && !(await credentialsExist(job.connector))) {
      issues.push(
        `ingest ${job.id}: connector ${job.connector} has no credentials on this device`,
      );
    }
  }
  return issues;
}
