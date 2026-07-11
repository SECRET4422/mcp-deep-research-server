# AgenticMarket Monetization

AgenticMarket handles billing but you need to add one header check.

We already added src/middleware/billing.ts. To enable:

1. List on https://agenticmarket.dev
2. Get AGENTIC_SECRET from dashboard
3. Set env var when starting MCP:
```
AGENTIC_MARKET_SECRET=ag_sec_xxx node build/index.js
```
Or in smithery.yaml config.

4. Billing middleware will verify x-agenticmarket-secret header.

If not set, server runs free (no breaking change).

Earnings: You set price, e.g. $0.05/call. AgenticMarket takes 10-20% for Stripe + fraud.

Payout: Monthly to Stripe/PayPal.
