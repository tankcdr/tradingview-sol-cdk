import { TradingConfig } from "../types";

export const tradingConfigs: Record<string, TradingConfig> = {
  "2h": {
    timeframe: "2h",
    parameterPath: "/tv/sol/2h/trading-state",
    secretPath: "/tv/sol/2h/wallet-secret",
    defaultTradingState: "NONE",
    defaultWalletSecret: '{ "key": [] }',
  },
  "3h": {
    timeframe: "3h",
    parameterPath: "/tv/sol/3h/trading-state",
    secretPath: "/tv/sol/3h/wallet-secret",
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
