# Contributing

## Development Setup

- [Zed](https://zed.dev)
- [Bun](https://bun.sh) 1.2.0+
- [Node.js](https://nodejs.org) 18+
- [Rust](https://rust-lang.org) 1.85.0+ with `wasm32-wasip1` target

```bash
git clone git@github.com:barnesoir/zed-bun-debugger.git
cd zed-bun-debugger
bun install
bun run scripts/vendor.ts
```

## Building

```bash
# Full build
bun run scripts/build.ts

# Bridge only
bun run scripts/build:bridge

# WASM only
bun run scripts/build:wasm
```

## Testing

```bash
# Unit tests
bun test tests/bridge.test.ts

# Integration test
bun run tests/integration.ts

# E2E test
bun run tests/e2e-debug.ts

# Build verification
bun run tests/verify-build.ts

# Full test suite
bun test tests/ && bun run tests/integration.ts && bun run tests/verify-build.ts
```

## Dev Extension Install

In Zed, open the command palette (`Cmd+Shift+P`) and run:

```
extensions: install dev extension
```

Select the `extension/` directory.

## Pull Request Guidelines

- Run the full test suite before submitting
- Ensure `bun run scripts/build.ts` passes
- Keep changes focused
- Follow existing code style
