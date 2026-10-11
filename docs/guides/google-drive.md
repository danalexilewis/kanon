---
schema: eddy-kb/document/v1
doc:
  id: f7fabe4a-9101-49b3-9af1-6af8d4c7be28
  title: Google Drive
  kind: derivative
  status: draft
---

# Google Drive

An ingest job copies a Drive folder into **circles** as Markdown. Each
file's sharing list is read (metadata only) and the document is placed
in the widest circle that may hold it. Google Docs are exported through
the Drive API as
`text/markdown`; uploaded `.md` files are downloaded as they are. Sheets,
Slides, PDFs, Word files and shortcuts are reported as
`unsupported_format` and skipped.

Kanon asks only for `drive.readonly`. It never writes to Drive.

## Option A: your own account (OAuth)

1. In the Google Cloud console, create a project and enable the
   **Google Drive API**.
2. Configure the consent screen. Set the publishing status to
   **In production**. In **Testing**, Google expires refresh tokens after
   seven days and the job stops with `connector_auth_required`. A personal,
   unverified client shows a warning at sign-in; that is expected.
   Workspace users can choose an **Internal** audience instead.
3. Create an OAuth client of type **Desktop app** and download its JSON.
4. Register and sign in:

```bash
pnpm kanon connector add team-drive --kind google-drive --client-secret ~/Downloads/client_secret_XXXX.json
pnpm kanon connector auth team-drive
```

`connector auth` opens a browser and listens on `127.0.0.1` for the
redirect (PKCE and a state check). Run it on the device that will run the
job.

## Option B: a service account

Use this for shared folders and headless machines.

1. Create a service account and a JSON key.
2. Share the Drive folder (or add the account to the shared drive) as a
   **Viewer**, using the service account's email.
3. Register it; no browser step is needed:

```bash
pnpm kanon connector add team-drive --kind google-drive --service-account ./key.json
```

Either way the secret is copied to `$KANON_HOME/credentials/<id>.json`
(mode `0600`). `config.yml` records only the id, kind and auth mode.
`kanon connector list` shows whether credentials are `ready`,
`needs_auth` or `missing`.

## Add the job

The folder id is the last part of the folder URL,
`https://drive.google.com/drive/folders/<folder-id>`. Add an ingest entry to
`config.yml`:

```yaml
ingest:
  - id: policies
    connector: team-drive
    route: [team, founders, me]
    folder: <folder-id>
    target: docs/policies
    schedule: off
```

## Scan, then download

Ingest runs in two steps. A scan lists the folder without downloading
anything. It records each file's Drive id, Kanon `doc.id`, folder, MIME type
and revision, and marks what a run would do:

```bash
pnpm kanon doctor
pnpm kanon ingest scan policies
```

The command prints totals, counts per MIME type and per folder, eligible
counts per circle, and how many documents are held. The listing is
`kanon/ingest-scan/v2`. A v1 scan is refused. Sharing is re-read every
run; Gemini meeting notes are often shared with the whole invite list, so
sharing alone rarely admits a note to team.

Then download from that listing:

```bash
pnpm kanon ingest run policies --from-scan --limit 20
pnpm kanon ingest run policies --from-scan
```

`--from-scan` reuses the saved listing instead of listing Drive again. If
the job's connector or folder has changed since the scan, the run refuses
and asks for a new scan. `--limit` downloads at most that many changed
documents, commits them, and leaves the rest for the next run; the report's
`deferred` field says how many are left. Progress goes to stderr, one line
per document. Scheduled ticks always list afresh.

The layout under `target` is a read-out of Drive, not a design to protect.
Change `folder` or `target` and scan again whenever the structure should
change.

## What lands in Git

- One Markdown file per document, under folders that mirror Drive
  (slugged), with provenance frontmatter. See
  [Document format](../standard/document-format.md#ingested-documents).
- Images inlined by the export go to `<target>/_assets/` or are stripped
  (`images: strip`).
- Documents over 10 MiB are skipped as `too_large`.
- Removing a file from the Drive folder removes it from the target on the
  next run. Files the job did not write are never touched.
- Pointing two jobs at overlapping folders in one source fails validation
  with a duplicate document id, and nothing is pushed.
