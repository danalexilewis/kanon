import { resolve } from 'node:path';

import { configCircles, circleAdmit, circleById } from '../config/schemas.js';
import { saveMachineConfig } from '../config/machine.js';
import { configWithCircle, createCircleRepos } from '../circles/init.js';
import { checkAudience } from '../hosts/audience.js';
import { loadIngestScan } from '../jobs/ingest-scan.js';
import { eligibleOnRoute, readersFor } from '../jobs/readers.js';
import { flagString, type ParsedCli } from './parse.js';
import { assertWriteAccess, printJson, requireConfig, validatedConfig } from './shared.js';

function shift(cli: ParsedCli): ParsedCli {
  return { ...cli, rest: cli.rest.slice(1) };
}

async function cmdCircleInit(cli: ParsedCli): Promise<void> {
  const id = cli.rest[0];
  const dir = flagString(cli.flags, 'dir');
  if (id === undefined || dir === undefined) {
    throw new Error('circle init <id> --dir <path>');
  }
  const config = await requireConfig();
  if (configCircles(config).some((circle) => circle.id === id)) {
    throw new Error(`Circle ${id} already exists`);
  }
  const repos = await createCircleRepos(id, resolve(dir));
  if (repos.isErr()) {
    throw new Error(repos.error.message);
  }
  const members = (flagString(cli.flags, 'members') ?? 'operator').split(',').filter((entry) => entry.length > 0);
  const ceiling = Number(flagString(cli.flags, 'ceiling') ?? '0');
  if (ceiling !== 0 && ceiling !== 1 && ceiling !== 2 && ceiling !== 3) {
    throw new Error('--ceiling must be 0, 1, 2 or 3');
  }
  const next = validatedConfig(configWithCircle(config, repos.value, members, ceiling));
  const source = next.sources.find((entry) => entry.id === repos.value.sourceId);
  if (source !== undefined) {
    await assertWriteAccess(source);
  }
  await saveMachineConfig(next);
  printJson({
    id,
    source: repos.value.sourceId,
    remote: repos.value.remote,
    path: repos.value.checkout,
  });
}

async function cmdCircleList(): Promise<void> {
  const config = await requireConfig();
  printJson(
    configCircles(config).map((circle) => {
      const source = config.sources.find((entry) => entry.id === circle.source);
      return {
        id: circle.id,
        source: circle.source,
        members: circle.members,
        ceiling: circle.ceiling,
        admit: circleAdmit(circle),
        remote: source?.remote,
        path: source?.path,
      };
    }),
  );
}

async function cmdCircleProbe(cli: ParsedCli): Promise<void> {
  const config = await requireConfig();
  const id = cli.rest[0];
  const circles = id === undefined ? configCircles(config) : configCircles(config).filter((circle) => circle.id === id);
  if (id !== undefined && circles.length === 0) {
    throw new Error('Unknown circle id');
  }
  const probes = [];
  for (const circle of circles) {
    const source = config.sources.find((entry) => entry.id === circle.source);
    if (source === undefined) {
      probes.push({ id: circle.id, ok: false, detail: 'Unknown source' });
      continue;
    }
    const audience = await checkAudience(circle, source);
    probes.push({
      id: circle.id,
      ok: audience.isOk(),
      ...(audience.isOk() ? { readers: audience.value.readers } : { detail: audience.error.message, code: audience.error.code }),
    });
  }
  printJson(probes);
}

/** Preview documents that would enter or leave a circle if membership changed. */
async function cmdCircleCheck(cli: ParsedCli): Promise<void> {
  const id = cli.rest[0];
  const add = flagString(cli.flags, 'add');
  const remove = flagString(cli.flags, 'remove');
  const jobId = flagString(cli.flags, 'job');
  if (id === undefined || (add === undefined) === (remove === undefined) || jobId === undefined) {
    throw new Error('circle check <id> --job <job> (--add|--remove) <person>');
  }
  const config = await requireConfig();
  const circle = circleById(config, id);
  if (circle === undefined) {
    throw new Error('Unknown circle id');
  }
  const person = add ?? remove!;
  const members =
    add !== undefined
      ? [...new Set([...circle.members, person])]
      : circle.members.filter((member) => member !== person);
  const scan = await loadIngestScan(jobId);
  if (scan.isErr()) {
    throw new Error(scan.error.message);
  }
  const patched = {
    ...config,
    circles: configCircles(config).map((entry) => (entry.id === id ? { ...entry, members } : entry)),
  };
  const enter: string[] = [];
  const leave: string[] = [];
  for (const item of scan.value.items) {
    const readers = readersFor(config, 'operator@example.test', {
      grants: [],
      sharing: 'full',
    });
    const before = eligibleOnRoute(config, [id], {
      people: item.readers,
      others: item.others,
      external: item.external,
      groupUnresolved: 0,
      sharing: item.sharing,
    });
    const after = eligibleOnRoute(patched, [id], {
      ...readers,
      people: item.readers,
      others: item.others,
      external: item.external,
      sharing: item.sharing,
    });
    const was = before.includes(id);
    const now = after.includes(id);
    if (!was && now) {
      enter.push(item.uri);
    }
    if (was && !now) {
      leave.push(item.uri);
    }
  }
  printJson({ circle: id, person, enter, leave });
}

export async function dispatchCircleCli(cli: ParsedCli): Promise<boolean> {
  if (cli.command !== 'circle') {
    return false;
  }
  const sub = cli.rest[0];
  if (sub === 'init') {
    await cmdCircleInit(shift(cli));
    return true;
  }
  if (sub === 'list' || sub === undefined) {
    await cmdCircleList();
    return true;
  }
  if (sub === 'probe') {
    await cmdCircleProbe(shift(cli));
    return true;
  }
  if (sub === 'check') {
    await cmdCircleCheck(shift(cli));
    return true;
  }
  throw new Error('circle init|list|probe|check');
}
