export const mockEnv = {
  development: {
    JUPITER_API_URL: "https://api.jup.ag",
    SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
    PARAMETER_TRADE_STATE: "/tv/sol/2h/trading-state",
    SECRET_WALLET_PK: "/tv/sol/2h/wallet-secret",
    TIMEFRAME: "2h",
  },
  staging: {
    JUPITER_API_URL: "https://quote-api.jup.ag/v6",
    SOLANA_RPC_URL: "https://api.devnet.solana.com",
    PARAMETER_TRADE_STATE: "/tv/sol/test/2h/trading-state",
    SECRET_WALLET_PK: "/tv/sol/test/2h/wallet-secret",
    TIMEFRAME: "2h",
  },
};
