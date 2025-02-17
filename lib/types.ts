// Defines the configuration structure for the trading lambda
export interface TradingConfig {
  timeframe: string;
  parameterPath: string;
  secretPath: string;
  defaultTradingState?: string;
  defaultWalletSecret?: string;
}
