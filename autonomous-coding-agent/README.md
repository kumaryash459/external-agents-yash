# Autonomous Coding Agent

An executable MVP of the proposed architecture. It runs the guarded workflow
`context -> analyze -> plan -> route -> code -> test -> review -> approval`.
Every transition is appended to an Entire-compatible development timeline. The
Databricks gateway is injected, so model access stays outside orchestration.

## Run

```powershell
npm install
$request = '{"request":"Add a health endpoint","repository":"."}'
$request | npm start
```

The default model gateway is deterministic and safe for local demonstrations.
Set `DATABRICKS_HOST`, `DATABRICKS_TOKEN`, and `DATABRICKS_ENDPOINT` to use a
Databricks serving endpoint. For specialised model routing, optionally set
`DATABRICKS_CODING_ENDPOINT`, `DATABRICKS_REASONING_ENDPOINT`, and
`DATABRICKS_FAST_ENDPOINT`; each overrides the default endpoint for that role.
Deployment never runs until a caller submits `approved: true`.

## Input

```json
{
  "request": "Add a health endpoint",
  "repository": ".",
  "approved": false,
  "proposedChanges": [{ "path": "src/health.js", "content": "export default 'ok';" }],
  "validationCommands": [["npm", "test"]],
  "tracePath": ".entire/autonomous-agent/timeline.jsonl"
}
```

`proposedChanges` are previewed in the review state but are only written when
`approved` is `true`. Validation commands use argument arrays, never a shell,
and their stdout/stderr and exit status are recorded in the timeline.

When a configured model returns the requested JSON proposal schema, its
`changes` become the reviewable proposed changes automatically. Supplying
`proposedChanges` explicitly takes precedence, which is useful for a UI or
approval workflow.

## Local API/UI

```powershell
npm run serve
```

Open `http://127.0.0.1:3000` for the local workflow console. The API exposes
`GET /health`, `POST /api/runs`, and `GET /api/runs/:id`. It deliberately binds
to loopback by default; add authentication before exposing it beyond a local
development machine.

## Deployment adapters

Deployment is opt-in and runs only after approval plus passing validation. Add
one of these request objects: `{"enabled":true,"provider":"docker"}`,
`{"enabled":true,"provider":"vercel","production":true}`, or
`{"enabled":true,"provider":"netlify","production":true}`. The matching
CLI must already be installed and authenticated. A custom argument-array
`command` is also supported.

## Databricks connection requirements

1. A Databricks workspace URL, such as `https://adb-<workspace-id>.<region>.azuredatabricks.net`.
2. A deployed serving endpoint that accepts chat-style `messages` input.
3. A personal access token or OAuth access token for an identity with **Can Query** permission on that endpoint.
4. Outbound HTTPS access from this service to the Databricks workspace; keep tokens in environment variables or a secret manager, never source control.

Configure either one default endpoint or one per model role:

```powershell
$env:DATABRICKS_HOST = "https://adb-<workspace-id>.<region>.azuredatabricks.net"
$env:DATABRICKS_TOKEN = "<access-token>"
$env:DATABRICKS_ENDPOINT = "shared-coding-endpoint"
# Optional overrides:
$env:DATABRICKS_CODING_ENDPOINT = "coding-endpoint"
$env:DATABRICKS_REASONING_ENDPOINT = "reasoning-endpoint"
$env:DATABRICKS_FAST_ENDPOINT = "fast-endpoint"
```

`DATABRICKS_ENDPOINT` is the **name of a Model Serving endpoint**, not a SQL
warehouse HTTP path. The agent already calls the serving-endpoint REST API, so
installing `@databricks/sdk` is optional unless this project will also manage
jobs, clusters, Unity Catalog, or Databricks SQL. Put the variables in
`autonomous-coding-agent/.env` for local development; it is ignored by Git and
loaded automatically by `npm start` and `npm run serve`.

Verify configuration without exposing secrets:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/config
```

## Entire connection requirements

1. The repository must be a Git repository and the `entire` CLI must be on `PATH`.
2. Choose and install an Entire-supported coding agent, such as Codex, then authenticate that agent normally.
3. For Codex, run `entire agent add codex`; it writes `.codex/hooks.json`. This app does that only when the request includes `"entire":{"enable":true,"agent":"codex"}` and the workflow is approved. Use `entire enable --agent codex` only for the initial Entire setup in a repository.
4. For this app itself to appear as an Entire-native coding agent, it still needs a separate `entire-agent-autonomous` external-agent binary implementing Entire's session, transcript, and hook protocol. The current integration safely configures an already supported agent; its JSONL timeline is not a substitute for that protocol adapter.
