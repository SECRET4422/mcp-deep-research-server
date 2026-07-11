# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.1.x   | :white_check_mark: |
| < 1.1   | :x:                |

## Reporting a Vulnerability

**Do NOT open a public issue for security vulnerabilities.**

Email or open a private security advisory on GitHub: https://github.com/SECRET4422/mcp-deep-research-server/security/advisories/new

We take scraping and SSRF risks seriously:

- This server fetches arbitrary URLs via `scrape_page` and `deep_research`. Only run it in trusted environments.
- No authentication bypass — search uses DuckDuckGo HTML, not authenticated APIs.
- Memory store is local JSON, no remote exfiltration.

## Hardening Recommendations

- Run MCP server in sandbox / low-privilege user
- If exposing as remote HTTP MCP, put behind auth proxy
- Use firewall to block access to internal metadata endpoints (169.254.169.254 etc) — a future version will add blocklist.

## Disclosure

We aim to respond within 48h and fix within 7 days for critical issues.
