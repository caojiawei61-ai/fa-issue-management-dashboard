# FA Issue Dashboard · v0.0.0

This repository is the new iteration baseline for the local FA Dashboard. It includes the app, local Node service, launchers, provider integrations, and the full embedded release history from v1.0 through v1.18.3.

## Run

- macOS: double-click `打开_FA_Dashboard.command`.
- Windows: double-click `start-windows.cmd`.
- Requires Node.js 22.13 or newer. The launcher installs the pinned dependencies when needed.

The default local data directory remains managed by the app. API keys for ordinary providers stay in backend memory and are cleared when the service restarts.

## Validate

Run `npm test` for the local unit checks. Run `npm run test:service` with the local backend running.

## Baseline changes

- Back to Tracker appears at the top-right; release version and build appear at the bottom of the left sidebar.
- PIC captions can be edited and PIC frames can be deleted in both report formats.
- Release identity reset to `0.0.0` for the GitHub baseline while previous release notes remain available in the app.
