# Manual E2E Test Checklist

Use this checklist when verifying the extension in Zed.

## Setup

- [ ] `bun run scripts/build.ts` completed successfully
- [ ] `extension/bin/bridge` exists and is executable
- [ ] `extension/bun_debugger.wasm` exists

## Dev Extension Install

- [ ] In Zed: `Cmd+Shift+P` → `extensions: install dev extension`
- [ ] Selected the `extension/` directory from this repo
- [ ] Zed reports "Extension installed" without errors
- [ ] `bun-debug` appears in the debug adapter list (`Cmd+Shift+D` → "Add Configuration")

## Debug Session

- [ ] Created `.zed/debug.json` with a launch configuration:
  ```json
  {
    "label": "Debug Test",
    "adapter": "bun-debug",
    "request": {
      "type": "launch",
      "program": "${workspaceFolder}/src/index.ts",
      "stopOnEntry": false
    }
  }
  ```
- [ ] Started debugging via Zed's debugger UI
- [ ] Zed shows "Running" status
- [ ] Breakpoint set in code
- [ ] Execution pauses at breakpoint
- [ ] Call stack is visible
- [ ] Variables panel shows scopes
- [ ] Continue/Step Over/Step Into/Step Out work
- [ ] Stop/Disconnect ends the session cleanly

## Cleanup

- [ ] No lingering `bun --inspect` processes (`ps aux | grep bun`)
- [ ] No lingering `node bridge` processes
- [ ] Bridge log output is clean (no unhandled exceptions)
