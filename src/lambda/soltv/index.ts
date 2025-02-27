import {
  JupiterClient,
  SolanaClient,
  TRADE_PAIRS,
  TradeService,
  TradeStateManager,
  WalletManager,
} from "@bot/index";


export const handler = async (event: any) => {
  const { JUPITER_API_URL, SOLANA_RPC_URL, SECRET_WALLET_PK, TIMEFRAME } =
    process.env;

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
    const wallet = await walletManager.getWallet();

    const paramStore = new TradeStateManager(
      process.env.PARAMETER_TRADE_STATE!
    );
    const currentState = await paramStore.getState();
    console.log("Current state:", currentState);

    const solanaClient = new SolanaClient(SOLANA_RPC_URL!, wallet);
    const jupiterClient = new JupiterClient(JUPITER_API_URL!, wallet);
    const tradeService = new TradeService(solanaClient, jupiterClient);

    // Parse and validate alert
    const alert = JSON.parse(event.body);
    const { time, action, from, to } = alert;

    try {
      validateAlert({
        action,
        time,
        from,
        to,
        expectedTimeframe: TIMEFRAME!,
      });
    } catch (error) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: (error as Error).message }),
      };
    }

    // check current state
    if (currentState === action) {
      console.log("Trade already executed for this action", action);
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: `Trade already executed for this action ${action}`,
        }),
      };
    } else {
      await paramStore.updateState(action);
    }

    // get the trade pair
    const tradePair = TRADE_PAIRS[`${from}-${to}`];

    //get amount to swap
    let amountToSwap = 0;
    if (from === "SOL") {
      const solBalance = await solanaClient.getSolBalance();
      amountToSwap = Math.floor(solBalance * tradePair.conversionFactor);
    } else {
      const currentBalance = await solanaClient.getTokenBalance(
        tradePair.inputToken.MINT
      );
      amountToSwap = Math.floor(currentBalance * tradePair.conversionFactor);
    }

    if (amountToSwap < tradePair.minAmountIn) {
      console.log(
        `Amount to swap is less than minimum amount in: ${amountToSwap} < ${tradePair.minAmountIn}`
      );
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: `Insufficient ${tradePair.inputToken.SYMBOL} balance to trade.`,
        }),
      };
    }

    // Execute trade
    let trade = await tradeService.executeTrade(tradePair, amountToSwap);

    console.log("Trade executed successfully:", trade);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Trade executed successfully", trade }),
    };
  } catch (error) {
    console.error("Error processing alert:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: (error as Error)?.message ?? "Internal server error",
      }),
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
  action,
  time,
  from,
  to,
  expectedTimeframe,
}: {
  action: string;
  time: string;
  from: string;
  to: string;
  expectedTimeframe: string;
}): boolean {
  if (!action || !time || !from || !to) {
    throw new Error("Error: Invalid alert - Missing required fields");
  }

  if (action !== "BUY" && action !== "SELL") {
    throw new Error("Error: Invalid action - Must be BUY or SELL");
  }

  if (time !== expectedTimeframe) {
    throw new Error(
      `Error: Timeframe is incorrect: Expect ${expectedTimeframe}, received ${time}`
    );
  }

  if (TRADE_PAIRS[`${from}-${to}`] === undefined) {
    throw new Error(`Error: Unsupported trade pair: ${from}-${to}`);
  }

  return true;
}
