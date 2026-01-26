# Chrome CloudFlare Helper

A Chrome extension that extends the CloudFlare UI with useful tidbits for DevOps practitioners.

## Features

- Adds "Resource ID" column to the DNS records table
  - Click any record ID to copy it to clipboard
  - Terraform resource block button - copies a `cloudflare_record` resource
  - Terraform import block button - copies an `import` block for existing resources
- Customizable Terraform templates via extension options

## Customizing Templates

You can customize the Terraform templates used when copying resource and import blocks:

1. Right-click the extension icon and select "Options", or go to `chrome://extensions/`, find the extension, and click "Details" > "Extension options"
2. Edit the Resource Block and/or Import Block templates
3. Click "Save Templates"

### Available Template Variables

Use `{{variable}}` syntax in your templates:

| Variable | Description | Example |
|----------|-------------|---------|
| `{{recordId}}` | DNS record ID (32-char hex) | `7d134fda3c61384347a407dcfe6fa117` |
| `{{zoneName}}` | Domain/zone name | `example.com` |
| `{{type}}` | Record type | `A`, `CNAME`, `MX` |
| `{{name}}` | Record hostname | `www.example.com` |
| `{{content}}` | Record value | `192.168.1.1` |
| `{{ttl}}` | TTL as displayed | `5 min`, `Auto` |
| `{{ttlSeconds}}` | TTL in seconds | `300`, `1` |
| `{{proxied}}` | Proxy status | `true`, `false` |
| `{{resourceName}}` | Generated Terraform resource name | `a_www_example_com` |

### Default Resource Template

```hcl
resource "cloudflare_record" "{{resourceName}}" {
  zone_id = "ZONE_ID"
  name    = "{{name}}"
  type    = "{{type}}"
  content = "{{content}}"
  ttl     = {{ttlSeconds}}
  proxied = {{proxied}}
}
```

### Default Import Template

```hcl
import {
  to = cloudflare_record.{{resourceName}}
  id = "ZONE_ID/{{recordId}}"
}
```

**Note:** Replace `ZONE_ID` in your templates with your actual zone ID, or use a Terraform variable like `var.zone_id`.

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
