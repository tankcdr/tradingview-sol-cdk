// src/lib/config/tokens.ts
export const TOKENS = {
  SOL: {
    SYMBOL: "SOL",
    MINT: "So11111111111111111111111111111111111111112", // Native SOL mint address
    DECIMALS: 9,
    SLIPPAGE_TOLERANCE: 0.5, // 0.5% slippage tolerance for SOL
    RETRY_AMOUNT_ADJUSTMENT: 0.98, // 2% reduction on retry
  },
  USDC: {
    SYMBOL: "USDC",
    MINT: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC mint address
    DECIMALS: 6,
    SLIPPAGE_TOLERANCE: 0.1, // 0.1% slippage tolerance for USDC (more stable)
    RETRY_AMOUNT_ADJUSTMENT: 0.99, // 1% reduction on retry
  },
  RAY: {
    SYMBOL: "RAY",
    MINT: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", // RAY mint address
    DECIMALS: 6,
    SLIPPAGE_TOLERANCE: 1.0, // 1.0% slippage tolerance for RAY (potentially more volatile)
    RETRY_AMOUNT_ADJUSTMENT: 0.97, // 3% reduction on retry due to higher volatility
  },
};

export interface TradePairInterface {
  inputToken: (typeof TOKENS)[keyof typeof TOKENS];
  outputToken: (typeof TOKENS)[keyof typeof TOKENS];
  minAmountIn: number;
  maxRetries: number;
  conversionFactor: number;
}
// Trade pair specific configurations
export const TRADE_PAIRS: { [index: string]: TradePairInterface } = {
  "SOL-USDC": {
    inputToken: TOKENS.SOL,
    outputToken: TOKENS.USDC,
    minAmountIn: 100_000_000, // Minimum SOL amount to trade
    maxRetries: 3,
    conversionFactor: 0.5,
  },
  "USDC-SOL": {
    inputToken: TOKENS.USDC,
    outputToken: TOKENS.SOL,
    minAmountIn: 10_000_000, // Minimum USDC amount to trade
    maxRetries: 3,
    conversionFactor: 1.0,
  },
  "RAY-USDC": {
    inputToken: TOKENS.RAY,
    outputToken: TOKENS.USDC,
    minAmountIn: 500_000, // Minimum RAY amount to trade
    maxRetries: 4, // More retries for potentially more volatile pair
    conversionFactor: 1.0,
  },
  "USDC-RAY": {
    inputToken: TOKENS.USDC,
    outputToken: TOKENS.RAY,
    minAmountIn: 10_000_000, // Minimum USDC amount to trade
    maxRetries: 4, // More retries for potentially more volatile pair
    conversionFactor: 1.0,
  },
};

// Helper functions for token operations
export const getTokenByMint = (mint: string) => {
  return Object.values(TOKENS).find((token) => token.MINT === mint);
};

export const getTokenBySymbol = (symbol: keyof typeof TOKENS) => {
  return TOKENS[symbol];
};

export const getPairConfig = (inputMint: string, outputMint: string) => {
  const inputToken = getTokenByMint(inputMint);
  const outputToken = getTokenByMint(outputMint);

  if (!inputToken || !outputToken) return null;

  const pairKey =
    `${inputToken.SYMBOL}-${outputToken.SYMBOL}` as keyof typeof TRADE_PAIRS;
  return TRADE_PAIRS[pairKey] || null;
};

// Export a list of supported token pairs for validation
export const VALID_PAIRS = Object.keys(TRADE_PAIRS).map((pairKey) => {
  const [fromSymbol, toSymbol] = pairKey.split("-");
  return { from: fromSymbol, to: toSymbol };
});
