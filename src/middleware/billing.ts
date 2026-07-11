// Optional billing middleware for AgenticMarket.dev and MCPize
// Enable by setting AGENTIC_MARKET_SECRET env var
// If not set, server runs in free mode (no auth)

export interface BillingConfig {
  agenticMarketSecret?: string;
  mcpizeApiKey?: string;
  requireAuth?: boolean;
}

export function createBillingMiddleware(config: BillingConfig) {
  const secret = config.agenticMarketSecret || process.env.AGENTIC_MARKET_SECRET || process.env.AGENTIC_SECRET;
  const mcpizeKey = config.mcpizeApiKey || process.env.MCPIZE_API_KEY;

  return {
    isBillingEnabled: !!secret || !!mcpizeKey,
    verifyRequest: (headers: Record<string, string> = {}): { allowed: boolean; reason?: string } => {
      if (!secret && !mcpizeKey) {
        return { allowed: true };
      }
      if (secret) {
        const incoming = headers['x-agenticmarket-secret'] || headers['X-AgenticMarket-Secret'] || headers['x-agentic-secret'];
        if (incoming === secret) return { allowed: true };
        if (!incoming && !config.requireAuth) {
          console.error(`[billing] No AgenticMarket secret header, soft mode - allowing.`);
          return { allowed: true };
        }
        return { allowed: false, reason: "Invalid or missing AgenticMarket secret" };
      }
      if (mcpizeKey) {
        const incoming = headers['x-mcpize-key'] || headers['authorization'];
        if (incoming && incoming.includes(mcpizeKey)) return { allowed: true };
        if (!config.requireAuth) return { allowed: true };
        return { allowed: false, reason: "Invalid MCPize key" };
      }
      return { allowed: true };
    },
    trackUsage: (toolName: string, userId?: string) => {
      console.error(`[billing] Usage: ${toolName} by ${userId || 'anonymous'} at ${new Date().toISOString()}`);
    }
  };
}
