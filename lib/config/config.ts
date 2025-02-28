import { TradingConfig } from "../types";

export const tradingConfigs: Record<string, TradingConfig> = {
  "2hsol": {
    timeframe: "2h",
    parameterPath: "/tv/sol/2h/trading-state",
    secretPath: "/tv/sol/2h/wallet-secret",
    defaultTradingState: "NONE",
    defaultWalletSecret: '{ "key": [] }',
  },
  "3hsol": {
    timeframe: "3h",
    parameterPath: "/tv/sol/3h/trading-state",
    secretPath: "/tv/sol/3h/wallet-secret",
    defaultTradingState: "NONE",
    defaultWalletSecret: '{ "key": [] }',
  },
  "3hray": {
    timeframe: "3h",
    parameterPath: "/tv/ray/3h/trading-state",
    secretPath: "/tv/ray/3h/wallet-secret",
    defaultTradingState: "NONE",
    defaultWalletSecret: '{ "key": [] }',
  },
};
