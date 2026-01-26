# Chrome CloudFlare Helper

A Chrome extension that extends the CloudFlare UI with useful tidbits for DevOps practitioners.

## Features

- Adds a "Resource ID" column to the DNS records table to aid with TF import, etc.

## Building

### Prerequisites

- Node.js 22+ (use `nvm use` if you have nvm installed)
- pnpm

### Build Steps

```bash
# Install dependencies
pnpm install

# Compile TypeScript
pnpm run build
```

For development with auto-rebuild on changes:

```bash
pnpm run watch
```

## Installing Locally

1. Build the extension (see above)
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top right)
4. Click "Load unpacked"
5. Select the `cloudflare-helper` directory (the project root, not `dist`)
6. Navigate to any Cloudflare DNS records page (e.g., `https://dash.cloudflare.com/{account_id}/{zone}/dns/records`)

## Reloading After Changes

After rebuilding, click the refresh icon on the extension card in `chrome://extensions/` to reload.

## License

MIT License - see [LICENSE](LICENSE) for details.
