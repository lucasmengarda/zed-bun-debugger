# Vendored Dependencies

This project vendors two packages from the Bun monorepo:

| Package | Source Path | Pinned Tag |
|---------|-------------|------------|
| `bun-debug-adapter-protocol` | `packages/bun-debug-adapter-protocol` | `bun-v1.3.14` |
| `bun-inspector-protocol` | `packages/bun-inspector-protocol` | `bun-v1.3.14` |

## Why Vendor?

These packages are NOT published to npm (404 on registry). The only way to consume
them is to extract them from the Bun monorepo.

## How to Update

1. Edit `scripts/vendor.ts` and change `BUN_TAG` to the desired release.
2. Run `bun run scripts/vendor.ts`.
3. Verify the build still works: `bun run scripts/build.ts`.
4. Update this file with the new tag.

## Import Path Fixes

The vendored `bun-debug-adapter-protocol` contains relative imports that point
to `../../../../bun-inspector-protocol` (monorepo root level). In our layout
both packages sit side-by-side under `vendor/`, so the path is shortened to
`../../../bun-inspector-protocol`. This fix is applied automatically by the
vendor script and is also reflected in the committed source.

## Local Patches

Re-applying `scripts/vendor.ts --force` overwrites `vendor/` and drops these. Re-apply them by hand.

### `bun-debug-adapter-protocol/src/debugger/adapter.ts` — TCP inspector in watch mode

Upstream picks the inspector transport purely by platform: unix domain socket everywhere but
Windows. A `--watch` reload restarts the runtime inside the same process and re-creates the
inspector server, and re-binding the same unix socket path fails while the previous listener is
still alive:

```
EADDRINUSE: address already in use, listen '/var/folders/.../xxxx.sock'
    at #listen (internal:debugger:162:16)
```

The debuggee then exits with code 1 on the first file change, so watch mode is unusable under the
debugger. `#launch` now selects the transport with `process.platform !== "win32" && !watchMode`,
so watch sessions use the TCP URL + `TCPSocketSignal` path, which rebinds cleanly and lets the
adapter re-attach after each reload. `--hot` keeps the inspector connection open across reloads
and would not need this, but it shares the same code path. Verified against `bun-v1.3.14`.

Still broken upstream, and not addressed here: after a `--watch` restart the fresh runtime keeps
the previous JSC breakpoints registered, while `Inspector.disconnected` has already run
`resetInternal()` and dropped the adapter's `#breakpoints` map. Re-registering then fails with
`Breakpoint for given location already exists.`, and the breakpoint fires at most once more.
`--hot` is unaffected. Fixing it means keeping the breakpoint bookkeeping across a re-attach and
explicitly removing the stale JSC breakpoints before re-adding them.
