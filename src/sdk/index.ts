export { knowledgeContract } from '../contracts/knowledge.js';
export { knowledgeHandlers, loadAppContext } from '../app/handlers.js';
export { knowledgeClient } from '../cli/client.js';
export { parseSourceManifest } from '../config/source-manifest.js';
export { parseMachineConfig } from '../config/machine.js';
export { assertIndexAccess, grantedIndexIds } from '../core/scope.js';
export { documentUri, parseDocumentUri } from '../core/uris.js';
export { OPERATOR, projectPrincipal } from '../core/principal.js';
export { updateIndex } from '../retrieval/index-job.js';
export { startMcpServer } from '../mcp/serve.js';
export { refreshSources, type RefreshResult, type SourceRefreshReport } from '../jobs/refresh.js';
export { runIngest, type IngestDeps, type IngestReport } from '../jobs/ingest.js';
export { runTick, type TickReport } from '../jobs/tick.js';
export { jobsStatus, type JobsStatus } from '../jobs/status.js';
export { createConnector } from '../connectors/registry.js';
export type {
  Connector,
  ConnectorFormat,
  ConnectorItem,
  ConnectorScope,
} from '../connectors/types.js';
