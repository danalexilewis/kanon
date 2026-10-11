---
schema: eddy-kb/document/v1
doc:
  id: f7fabe4a-9101-49b3-9af1-6af8d4c7be28
  title: Google Drive
  kind: derivative
  status: draft
---

# Google Drive

An ingest job copies a Drive folder into a source as Markdown, commits it
and pushes it. Google Docs are exported through the Drive API as
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
    source: <write-access source id>
    folder: <folder-id>
    target: docs/policies
    schedule: weekly
```

Then try it:

```bash
pnpm kanon doctor
pnpm kanon ingest run policies --dry-run
pnpm kanon ingest run policies
```

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
