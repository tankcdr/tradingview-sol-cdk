import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
} from "@aws-sdk/client-ssm";

import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";

import bs58 from "bs58";

import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";

const SOL_MINT = "So11111111111111111111111111111111111111112";
//const WSOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const ssm = new SSMClient({});
const secretsManager = new SecretsManagerClient({});

let solanaConnection: Connection | null = null;
let wallet: Keypair | null = null;

// facilitate access to environment variables and supports testing
const getEnvVars = () => ({
  JUPITER_API_URL: process.env.JUPITER_API_URL || "",
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL || "",
  PARAMETER_TRADE_STATE: process.env.PARAMETER_TRADE_STATE || "",
  SECRET_WALLET_PK: process.env.SECRET_WALLET_PK || "",
  TIMEFRAME: process.env.TIMEFRAME || "",
});

const getSolanaConnection = () => {
  if (solanaConnection) return solanaConnection;

  const { SOLANA_RPC_URL } = getEnvVars();

  solanaConnection = new Connection(SOLANA_RPC_URL, "confirmed");
  return solanaConnection;
};

const getWallet = async () => {
  if (wallet) return wallet;

  const { SECRET_WALLET_PK } = getEnvVars();

  try {
    const secret = await secretsManager.send(
      new GetSecretValueCommand({
        SecretId: SECRET_WALLET_PK,
        VersionStage: "AWSCURRENT",
      })
    );

    if (secret.SecretString) {
      const parsedSecret = bs58.decode(secret.SecretString);
      wallet = Keypair.fromSecretKey(parsedSecret);
      return wallet;
    }
    throw new Error("Secret string is undefined");
  } catch (error) {
    console.error("Error fetching private key from Secrets Manager:", error);
    throw new Error("Failed to retrieve private key.");
  }
};

const updateState = async (state: string) => {
  const { PARAMETER_TRADE_STATE } = getEnvVars();

  const response = await ssm.send(
    new PutParameterCommand({
      Name: PARAMETER_TRADE_STATE,
      Value: state,
      Type: "String",
      Overwrite: true,
    })
  );
};

const getState = async () => {
  const { PARAMETER_TRADE_STATE } = getEnvVars();
  try {
    const response = await ssm.send(
      new GetParameterCommand({
        Name: PARAMETER_TRADE_STATE,
      })
    );

    return response.Parameter?.Value || "NONE";
  } catch (error) {
    console.error("Error retrieving state:", error);
    throw new Error("Failed to retrieve state.");
  }
};

const getTokenBalance = async (mintAddress: string) => {
  try {
    const wallet = await getWallet();

    const tokenAccount = await getAssociatedTokenAddress(
      new PublicKey(mintAddress),
      wallet.publicKey
    );
    const accountInfo = await getAccount(getSolanaConnection(), tokenAccount);
    return Number(accountInfo.amount);
  } catch (error) {
    console.error(`Error fetching balance for ${mintAddress}:`, error);
    throw error;
  }
};

// Check best swap route for given amount
// Future, add wSOL support
const getBestSwapRoute = async () => {
  const { JUPITER_API_URL } = getEnvVars();
  try {
    const solQuote = await fetch(
      `${JUPITER_API_URL}/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=100000000&slippageBps=50&restrictIntermediateTokens=true`
    );
    const solData = await solQuote.json();

    /* const wsolQuote = await fetch(
      `${JUPITER_API_URL}/quote?inputMint=${WSOL_MINT}&outputMint=${USDC_MINT}&amount=${amount}`
    );
    const wsolData = await wsolQuote.json();
    return solData.outAmount > wsolData.outAmount ? SOL_MINT : WSOL_MINT;
    */

    return solData;
  } catch (error) {
    console.error("Error fetching best swap route:", error);
    throw new Error("Failed to fetch best swap route");
  }
};

const executeTrade = async (
  inputMint: string,
  outputMint: string,
  amount: number
) => {
  const { JUPITER_API_URL } = getEnvVars();
  try {
    const wallet = await getWallet();

    const response = await fetch(
      `${JUPITER_API_URL}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`
    );
    const quote = await response.json();
    console.log("Trade Quote:", quote);

    // Create a transaction to swap tokens
    const { transactionSwap } = await (
      await fetch(`${JUPITER_API_URL}/swap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          quote,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
        }),
      })
    ).json();
    console.log("Swap transaction: ", transactionSwap);

    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(transactionSwap, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    console.log("Deserialized transaction:", transaction);

    // sign the transaction
    transaction.sign([wallet]);

    const rawTransaction = transaction.serialize();
    const txid = await getSolanaConnection().sendRawTransaction(
      rawTransaction,
      {
        skipPreflight: true,
        maxRetries: 3,
      }
    );
    await getSolanaConnection().confirmTransaction(txid);

    return { quote, txid };
  } catch (error) {
    console.error("Error: Trade execution failed:", error);
    throw new Error("Trade execution failed");
  }
};

// Entry point for Lambda function
export const handler = async (event: any) => {
  const { TIMEFRAME } = getEnvVars();

  try {
    //validate environment variables and event body
    const validationResult = validateEnvironment(event);
    if (validationResult) return validationResult;

    // validate access to state and wallet
    await getWallet();
    const lastState = await getState();
    console.log(`Current stored state: ${lastState}`);

    // Parse TradingView alert
    const alert = JSON.parse(event.body);
    console.log("Received TradingView alert:", alert);

    // Validate alert, model isn't used at this point
    const { time, action, asset } = alert;

    if (!time || !action || !asset) {
      console.error("Error: Invalid alert - Missing required fields");
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Invalid alert: Missing required fields",
        }),
      };
    }

    // make sure we are trading on the same timeframe
    if (time !== TIMEFRAME) {
      console.error(
        `Error: Timeframe is incorrect: Expect ${TIMEFRAME}, received ${time}`,
        asset
      );
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: `Error: Timeframe is incorrect: Expect ${TIMEFRAME}, received ${time}`,
        }),
      };
    }

    // make sure this is SOL and not some other asset we are trading
    if (asset !== "SOL") {
      console.error("Error: Unsupported asset - Only SOL is supported", asset);
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Error: Unsupported asset - Only SOL is supported",
        }),
      };
    }

    // it is possible to get the same signal { BUY | SELL } multiple times
    // and we are only interested in trading when the state changes
    if (action === lastState) {
      console.log("State check: No trade needed, state unchanged.");
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No trade executed, state unchanged" }),
      };
    }

    let trade;
    // Fetch best route dynamically
    // Idea is to be able to handle SOL or wSOL, but right now only SOL is supported
    const bestMint = await getBestSwapRoute();
    console.log("Best swap route:", bestMint);

    if (action === "BUY" && lastState === "SELL") {
      const usdcBalance = await getTokenBalance(USDC_MINT);
      if (usdcBalance > 0) {
        trade = await executeTrade(USDC_MINT, bestMint, usdcBalance);
        await updateState("BUY");
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: "Insufficient USDC.",
          }),
        };
      }
    } else if (action === "SELL" && lastState === "BUY") {
      const solBalance = await getTokenBalance(bestMint);
      const amountToSell = solBalance / 2; // Sell half of bestMint (either SOL or wSOL)
      if (amountToSell > 0.1) {
        trade = await executeTrade(bestMint, USDC_MINT, amountToSell);
        await updateState("SELL");
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({
            message: "Insufficient SOL.",
          }),
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

/********************************************************************************
 * Validate environment variables and event body
 ********************************************************************************/
const validateEnvironment = (event: any) => {
  const { PARAMETER_TRADE_STATE, SECRET_WALLET_PK, TIMEFRAME } = getEnvVars();
  // Validate environment variables
  if (!PARAMETER_TRADE_STATE) {
    console.error("Error: Invalid request - trading state not found");
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request: trading state not found",
      }),
    };
  }

  if (!SECRET_WALLET_PK) {
    console.error("Error: Invalid request - wallet private key not found");
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request: wallet private key not found",
      }),
    };
  }

  if (!TIMEFRAME) {
    console.error("Error: Invalid request - timeframe not found");
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request: timeframe not found",
      }),
    };
  }

  if (!event.body) {
    console.error("Error: Invalid request - No body found in event");
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: "Invalid request: No body found",
      }),
    };
  }

  return null;
};
