import { TradingConfig } from "../types";

export const tradingConfigs: Record<string, TradingConfig> = {
  "2h": {
    timeframe: "2h",
    parameterPath: "/tv/sol/2h/trading-state",
    secretPath: "/tv/sol/2h/wallet-secret",
    defaultTradingState: "NONE",
    defaultWalletSecret: '{ "key": [] }',
  },
  "4h": {
    timeframe: "4h",
    parameterPath: "/tv/sol/4h/trading-state",
    secretPath: "/tv/sol/4h/wallet-secret",
    defaultTradingState: "NONE",
    defaultWalletSecret: '{ "key": [] }',
  },
  "15m": {
    timeframe: "15m",
    parameterPath: "/tv/sol/15m/trading-state",
    secretPath: "/tv/sol/15m/wallet-secret",
    defaultTradingState: "NONE",
    defaultWalletSecret: '{ "key": [] }',
  },
};
