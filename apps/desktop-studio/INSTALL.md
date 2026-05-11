# Installation Guide

This guide walks you through setting up Hermes Desktop Studio from scratch.

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js 18+** — [Download from nodejs.org](https://nodejs.org/) or use a version manager like `nvm` or `fnm`
- **pnpm 8+** — Install via: `npm install -g pnpm`
- **Rust 1.70+** — [Install from rustup.rs](https://rustup.rs/)
- **Git** — For cloning the repository

### Verify your installations

```bash
node --version   # Should be 18.0.0 or higher
pnpm --version   # Should be 8.0.0 or higher
rustc --version  # Should be 1.70.0 or higher
cargo --version  # Should match rustc
git --version    # Any recent version
```

## Clone and Install

```bash
# Clone the repository
git clone https://github.com/NousResearch/hermes-shell.git
cd hermes-shell

# Install Node dependencies
pnpm install

# Install Rust dependencies (handled automatically by Tauri)
```

## Tauri Development Setup

Tauri requires some additional setup for desktop development.

### 1. Install Tauri CLI

```bash
pnpm add -D @tauri-apps/cli
```

### 2. Configure Rust toolchain

Tauri uses the Rust toolchain. The default settings work well, but for faster builds you can configure:

```bash
# Install rust-src for Tauri
rustup target add x86_64-unknown-linux-gnu

# For macOS
rustup target add aarch64-apple-darwin

# For Windows
rustup target add x86_64-pc-windows-msvc
```

### 3. Set up environment variables (optional)

Create a `.env` file in `apps/desktop-studio/` if you need custom configuration:

```bash
TAURI_DEV_PORT=1420
TAURI_DEV_HOST=localhost
```

## Running the Development Server

### Frontend only (browser-based)

If you want to test the web UI without the desktop shell:

```bash
cd apps/desktop-studio
pnpm dev
```

Open http://localhost:1420 in your browser.

### Full Tauri desktop app

```bash
cd apps/desktop-studio
pnpm tauri dev
```

This will:
1. Start the Vite dev server
2. Open a native desktop window
3. Connect to the Hermes Agent adapter

The first run may take a few minutes to compile Rust dependencies.

## Building the App

### Build frontend only

```bash
cd apps/desktop-studio
pnpm build
```

Output goes to `apps/desktop-studio/dist/`.

### Build Tauri app (production)

```bash
cd apps/desktop-studio
pnpm tauri build
```

Output:
- Linux: `src-tauri/target/release/hermes-desktop-studio`
- macOS: `src-tauri/target/release/bundle/macos/Hermes Desktop Studio.app`
- Windows: `src-tauri/target/release/bundle/msi/`

### Build for a specific platform

```bash
# Linux only
pnpm tauri build --target x86_64-unknown-linux-gnu

# macOS only
pnpm tauri build --target aarch64-apple-darwin

# Windows only
pnpm tauri build --target x86_64-pc-windows-msvc
```

## Troubleshooting

### Rust compilation errors

```bash
# Update Rust
rustup update

# Clean Tauri build cache
cd src-tauri
cargo clean
```

### Node module issues

```bash
# Remove node_modules and reinstall
rm -rf node_modules
pnpm install
```

### Port already in use

```bash
# Find and kill the process on port 1420
lsof -ti:1420 | xargs kill -9
```

### Playwright test failures

```bash
# Install Playwright browsers
pnpm test:e2e:install
```

## Next Steps

Once installed, see [SETUP.md](./SETUP.md) for first-time configuration including:
- Connecting to Hermes Agent
- Configuring model providers
- Setting up skills and MCP servers
- Importing existing configurations