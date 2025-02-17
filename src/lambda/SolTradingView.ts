import * as AWS from "aws-sdk";

import {
  Connection,
  Keypair,
  sendAndConfirmTransaction,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";

import { getAccount, getAssociatedTokenAddress } from "@solana/spl-token";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

const JUPITER_API_URL = "https://quote-api.jup.ag/v6";
const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

const PARAMETER_TRADE_STATE = process.env.PARAMETER_TRADE_STATE || "";
const SECRET_WALLET_PK = process.env.SECRET_WALLET_PK || "";

const ssm = new AWS.SSM();
const secretsManager = new AWS.SecretsManager();
const connection = new Connection(SOLANA_RPC_URL, "confirmed");

let wallet: Keypair | null = null;

const getWallet = async () => {
  if (wallet) return wallet;
  try {
    const secret = await secretsManager
      .getSecretValue({ SecretId: SECRET_WALLET_PK })
      .promise();
    if (secret.SecretString) {
      const parsedSecret = JSON.parse(secret.SecretString);
      wallet = Keypair.fromSecretKey(
        new Uint8Array(JSON.parse(parsedSecret.wallet_private_key))
      );
      return wallet;
    }
    throw new Error("Secret string is undefined");
  } catch (error) {
    console.error("Error fetching private key from Secrets Manager:", error);
    throw new Error("Failed to retrieve private key.");
  }
};

const updateState = async (state: string) => {
  await ssm
    .putParameter({
      Name: PARAMETER_TRADE_STATE,
      Value: state,
      Type: "String",
      Overwrite: true,
    })
    .promise();
};

const getState = async () => {
  try {
    const result = await ssm
      .getParameter({ Name: PARAMETER_TRADE_STATE })
      .promise();
    return result.Parameter?.Value || "NONE";
  } catch (error) {
    console.error("Error retrieving state:", error);
    return "NONE";
  }
};

const getTokenBalance = async (mintAddress: string) => {
  try {
    const wallet = await getWallet();

    const tokenAccount = await getAssociatedTokenAddress(
      new PublicKey(mintAddress),
      wallet.publicKey
    );
    const accountInfo = await getAccount(connection, tokenAccount);
    return Number(accountInfo.amount);
  } catch (error) {
    console.error(`Error fetching balance for ${mintAddress}:`, error);
    return 0;
  }
};

// Check best swap route for given amount
// Future, add wSOL support
const getBestSwapRoute = async (amount: number) => {
  try {
    const solQuote = await fetch(
      `${JUPITER_API_URL}/quote?inputMint=${SOL_MINT}&outputMint=${USDC_MINT}&amount=${amount}`
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
    return SOL_MINT; // Default to SOL if error occurs
  }
};

const executeTrade = async (
  inputMint: string,
  outputMint: string,
  amount: number
) => {
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
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 3,
    });
    await connection.confirmTransaction(txid);

    return { quote, txid };
  } catch (error) {
    console.error("Error: Trade execution failed:", error);
    throw new Error("Trade execution failed");
  }
};

// Entry point for Lambda function
export const handler = async (event: any) => {
  try {
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

    if (!event.body) {
      console.error("Error: Invalid request - No body found in event");
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Invalid request: No body found",
        }),
      };
    }

    // Parse TradingView alert
    const alert = JSON.parse(event.body);
    console.log("Received TradingView alert:", alert);

    // Validate alert, model isn't used at this point
    const { _, action, asset } = alert;

    //note: model is not used at this point
    if (/*!model ||*/ !action || !asset) {
      console.error("Error: Invalid alert - Missing required fields");
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Invalid alert: Missing required fields",
        }),
      };
    }

    // make sure this is SOL and not some other asset we are trading
    if (asset !== "SOL") {
      console.error(
        "Error: Unsupported asset: Only SOL is supported, received",
        asset
      );
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Unsupported asset: Only SOL is supported",
        }),
      };
    }

    const lastState = await getState();
    console.log(`Current stored state: ${lastState}`);

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
    const bestMint = await getBestSwapRoute(1);

    if (action === "BUY" && lastState === "SELL") {
      const usdcBalance = await getTokenBalance(USDC_MINT);
      if (usdcBalance > 0) {
        trade = await executeTrade(USDC_MINT, bestMint, usdcBalance);
        await updateState("BUY");
      }
    } else if (action === "SELL" && lastState === "BUY") {
      const solBalance = await getTokenBalance(bestMint);
      const amountToSell = solBalance / 2; // Sell half of bestMint (either SOL or wSOL)
      if (amountToSell > 0) {
        trade = await executeTrade(bestMint, USDC_MINT, amountToSell);
        await updateState("SELL");
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
