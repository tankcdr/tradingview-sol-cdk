import {
  VersionedTransaction,
  TransactionSignature,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { JupiterClient, SolanaClient } from "@bot/index";

interface TradeResult {
  txId: string;
  quote: any;
  retryCount?: number;
}

class TradeError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "TradeError";
  }
}

export class TradeService {
  private solanaClient: SolanaClient;
  private jupiterClient: JupiterClient;
  private readonly maxRetries: number;
  private readonly baseRetryDelayMs: number;

  constructor(
    solanaClient: SolanaClient,
    jupiterClient: JupiterClient,
    maxRetries: number = 3, // Increased default
    baseRetryDelayMs: number = 1000 // Base delay for backoff
  ) {
    this.maxRetries = maxRetries;
    this.baseRetryDelayMs = baseRetryDelayMs;
    this.solanaClient = solanaClient;
    this.jupiterClient = jupiterClient;
  }

  // Utility to sleep with exponential backoff
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Send and confirm transaction with optimized logic
  private async sendAndConfirmVersionedTransaction(
    transaction: VersionedTransaction,
    maxRetries: number = 5
  ): Promise<TransactionSignature> {
    const connection = this.solanaClient.getConnection();
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    transaction.message.recentBlockhash = latestBlockhash.blockhash;

    // Add priority fee (assuming you'll handle via Jupiter later)
    const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 200000,
    });
    // Note: Assuming transaction is signed by jupiterClient

    const signature = await this.solanaClient.sendTransaction(transaction, {
      maxRetries,
      skipPreflight: false,
    });
    console.log(`[Trade] Transaction sent: ${signature}`);

    try {
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      if (confirmation.value.err) {
        throw new Error(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
        );
      }
      console.log(`[Trade] Confirmed: https://solscan.io/tx/${signature}`);
      return signature;
    } catch (error: any) {
      if (error.message.includes("block height")) {
        console.log("[Trade] Block height exceeded - Will retry");
        throw new TradeError("Block height exceeded", "BLOCKHEIGHT_EXCEEDED");
      }
      throw error;
    }
  }

  // Execute trade with centralized error handling and retries
  async executeTrade(
    inputMint: string,
    outputMint: string,
    amount: number,
    retryCount = 0
  ): Promise<TradeResult> {
    console.log(`[Trade] Starting trade execution (attempt ${retryCount + 1})`);
    console.log(
      `[Trade] Parameters: inputMint=${inputMint}, outputMint=${outputMint}, amount=${amount}`
    );

    try {
      const quote = await this.jupiterClient.getQuote(
        inputMint,
        outputMint,
        amount
      );
      console.log("[Trade] Quote received:", JSON.stringify(quote, null, 2));

      const transaction = await this.jupiterClient.createSwapTransaction(quote);
      console.log("[Trade] Swap transaction created");

      const txId = await this.sendAndConfirmVersionedTransaction(transaction);
      console.log(`[Trade] Success: https://solscan.io/tx/${txId}`);
      return { txId, quote, retryCount };
    } catch (error: any) {
      console.error(
        `[Trade] Error on attempt ${retryCount + 1}:`,
        error.message
      );

      // Handle specific cases
      if (
        error.message.includes("TransactionExpiredTimeoutError") ||
        error.message.includes("timeout")
      ) {
        console.log("[Trade] Timeout - Considering successful");
        return { txId: "unknown", quote: null, retryCount }; // Adjust as needed
      }

      // Check if retryable
      if (this.isRetryableError(error) && retryCount < this.maxRetries) {
        const delay = this.baseRetryDelayMs * Math.pow(2, retryCount);
        console.log(`[Trade] Retrying in ${delay}ms...`);
        await this.sleep(delay);
        return this.executeTrade(inputMint, outputMint, amount, retryCount + 1);
      }

      throw new TradeError(`Trade failed: ${error.message}`, "TRADE_ERROR");
    }
  }

  // Determine if an error is retryable
  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      "TransactionExpiredBlockheightExceededError",
      "BLOCKHEIGHT_EXCEEDED",
      "InstructionError",
      "Network error",
      "timeout", // Broader transient error
    ];
    return retryableErrors.some(
      (err) => error.message.includes(err) || error.code?.includes(err)
    );
  }
}
