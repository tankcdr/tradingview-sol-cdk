import {
  JupiterClient,
  SolanaClient,
  TOKEN_CONFIG,
  TradeService,
  TradeStateManager,
  WalletManager,
} from "@bot/index";

export const handler = async (event: any) => {
  const {
    JUPITER_API_URL,
    SOLANA_RPC_URL,
    PARAMETER_TRADE_STATE,
    SECRET_WALLET_PK,
    TIMEFRAME,
  } = process.env;

  try {
    // Validate environment and event
    if (!validateEnvironment({ event, env: process.env })) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid environment configuration" }),
      };
    }

    // Initialize managers and clients
    const walletManager = new WalletManager(SECRET_WALLET_PK!);
    const stateManager = new TradeStateManager(PARAMETER_TRADE_STATE!);
    const wallet = await walletManager.getWallet();

    const solanaClient = new SolanaClient(SOLANA_RPC_URL!, wallet);
    const jupiterClient = new JupiterClient(JUPITER_API_URL!, wallet);
    const tradeService = new TradeService(solanaClient, jupiterClient);

    // Get current state
    const lastState = await stateManager.getState();
    console.log(`Current stored state: ${lastState}`);

    // Parse and validate alert
    const alert = JSON.parse(event.body);
    const { time, action, asset } = alert;

    try {
      validateAlert({ time, action, asset, expectedTimeframe: TIMEFRAME! });
    } catch (error) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: (error as Error).message }),
      };
    }

    // Check if trade is needed
    if (action === lastState) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No trade executed, state unchanged" }),
      };
    }

    // Execute trade based on action
    let trade;
    if (action === "BUY" && lastState === "SELL") {
      const usdcBalance = await solanaClient.getTokenBalance(
        TOKEN_CONFIG.USDC_MINT
      );
      if (usdcBalance > 0) {
        trade = await tradeService.executeTrade(
          TOKEN_CONFIG.USDC_MINT,
          TOKEN_CONFIG.SOL_MINT,
          usdcBalance
        );
        await stateManager.updateState("BUY");
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Insufficient USDC." }),
        };
      }
    } else if (action === "SELL" && lastState === "BUY") {
      const solBalance = await solanaClient.getSolBalance();
      const amountToSwap = Math.floor(solBalance / 2);

      if (amountToSwap > 100_000) {
        trade = await tradeService.executeTrade(
          TOKEN_CONFIG.SOL_MINT,
          TOKEN_CONFIG.USDC_MINT,
          amountToSwap
        );
        await stateManager.updateState("SELL");
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Insufficient SOL." }),
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Trade executed successfully", trade }),
    };
  } catch (error) {
    console.error("Error processing alert:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

function validateEnvironment({
  event,
  env,
}: {
  event: any;
  env: NodeJS.ProcessEnv;
}): boolean {
  const requiredEnvVars = [
    "PARAMETER_TRADE_STATE",
    "SECRET_WALLET_PK",
    "TIMEFRAME",
  ];
  const hasAllEnvVars = requiredEnvVars.every((varName) => env[varName]);
  return hasAllEnvVars && !!event.body;
}

function validateAlert({
  time,
  action,
  asset,
  expectedTimeframe,
}: {
  time: string;
  action: string;
  asset: string;
  expectedTimeframe: string;
}): boolean {
  if (!time || !action || !asset) {
    throw new Error("Error: Invalid alert - Missing required fields");
  }

  if (time !== expectedTimeframe) {
    throw new Error(
      `Error: Timeframe is incorrect: Expect ${expectedTimeframe}, received ${time}`
    );
  }

  if (asset !== "SOL") {
    throw new Error("Error: Unsupported asset - Only SOL is supported");
  }

  return true;
}
