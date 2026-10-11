import { loadDevice } from '../config/device.js';
import { configCircles, ingestSources, ingestTarget, type MachineConfig } from '../config/schemas.js';
import { checkAudience } from '../hosts/audience.js';
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

  for (const circle of configCircles(config)) {
    const source = config.sources.find((entry) => entry.id === circle.source);
    if (source === undefined) {
      issues.push(`circle ${circle.id}: unknown source`);
      continue;
    }
    const audience = await checkAudience(circle, source);
    if (audience.isErr()) {
      issues.push(`circle ${circle.id}: ${audience.error.message}`);
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
    for (const source of ingestSources(config, job)) {
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
