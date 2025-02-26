import { VersionedTransaction } from "@solana/web3.js";
import { JupiterClient, SolanaClient } from "@bot/index";

interface TradeResult {
  txId: string;
  quote: any;
  retryCount?: number;
}

class TradeError extends Error {
  constructor(message: string, public readonly code: string = "TRADE_ERROR") {
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
    maxRetries: number = 3,
    baseRetryDelayMs: number = 1000
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
      // Get quote from Jupiter
      const quote = await this.jupiterClient.getQuote(
        inputMint,
        outputMint,
        amount
      );
      console.log("[Trade] Quote received:", JSON.stringify(quote, null, 2));

      // Create swap transaction
      const transaction = await this.jupiterClient.createSwapTransaction(quote);
      console.log("[Trade] Swap transaction created");

      // Send transaction using SolanaClient (which handles signing)
      const txId = await this.solanaClient.sendTransaction(transaction, {
        maxRetries: 3,
        skipPreflight: false,
      });
      console.log(`[Trade] Transaction sent: ${txId}`);

      // Confirm transaction using SolanaClient's confirmTransaction method
      const success = await this.solanaClient.confirmTransaction(txId);

      if (success) {
        console.log(`[Trade] Success: https://solscan.io/tx/${txId}`);
        return { txId, quote, retryCount };
      } else {
        throw new TradeError(
          "Transaction failed to confirm",
          "CONFIRMATION_FAILED"
        );
      }
    } catch (error: any) {
      console.error(
        `[Trade] Error on attempt ${retryCount + 1}:`,
        error.message
      );

      // Extract error details for better handling
      const errorMessage = error.message || "";
      const errorLogs = this.extractErrorLogs(error);

      // Log error details for debugging
      if (errorLogs) {
        console.log("[Trade] Error logs:", errorLogs);
      }

      // Handle specific cases
      if (
        errorMessage.includes("TransactionExpiredTimeoutError") ||
        errorMessage.includes("timeout")
      ) {
        console.log("[Trade] Timeout - Considering successful");
        return { txId: "timeout", quote: null, retryCount };
      }

      // Check if retryable
      if (this.isRetryableError(error) && retryCount < this.maxRetries) {
        const delay = this.baseRetryDelayMs * Math.pow(2, retryCount);
        console.log(`[Trade] Retrying in ${delay}ms...`);

        // For insufficient funds errors, we should get a fresh quote as the price might have changed
        if (this.isInsufficientFundsError(error)) {
          console.log(
            "[Trade] Insufficient funds detected - Will retry with a fresh quote"
          );
          // For insufficient funds, we might want to adjust the amount slightly
          // This could be a configurable parameter if needed
          const adjustedAmount = amount * 0.98; // Try with 98% of original amount
          console.log(
            `[Trade] Adjusting amount from ${amount} to ${adjustedAmount}`
          );

          await this.sleep(delay);
          return this.executeTrade(
            inputMint,
            outputMint,
            adjustedAmount,
            retryCount + 1
          );
        }

        await this.sleep(delay);
        return this.executeTrade(inputMint, outputMint, amount, retryCount + 1);
      }

      throw new TradeError(
        `Trade failed: ${error.message}`,
        error.code || "TRADE_ERROR"
      );
    }
  }

  // Extract error logs from different error formats
  private extractErrorLogs(error: any): string[] | null {
    if (error.logs) {
      return error.logs;
    }

    // Try to extract logs from error message
    if (error.message) {
      const logsMatch = error.message.match(/Logs:\s*(\[[\s\S]*?\])/);
      if (logsMatch && logsMatch[1]) {
        try {
          return JSON.parse(logsMatch[1]);
        } catch (e) {
          return null;
        }
      }
    }

    return null;
  }

  // Check specifically for insufficient funds errors
  private isInsufficientFundsError(error: any): boolean {
    const errorMessage = error.message || "";
    const errorLogs = this.extractErrorLogs(error);

    // Check the error message
    if (
      errorMessage.includes("insufficient lamports") ||
      errorMessage.includes("0x1") // Common error code for insufficient funds
    ) {
      return true;
    }

    // Check the logs if available
    if (errorLogs) {
      for (const log of errorLogs) {
        if (
          log.includes("insufficient lamports") ||
          log.includes("Transfer: insufficient")
        ) {
          return true;
        }
      }
    }

    return false;
  }

  // Determine if an error is retryable
  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      "TransactionExpiredBlockheightExceededError",
      "BLOCKHEIGHT_EXCEEDED",
      "InstructionError",
      "Network error",
      "timeout",
      "Transaction simulation failed",
      "Transaction was not confirmed",
      "failed to send transaction",
      "Transaction expired",
      "Block height exceeded",
      "503 Service Unavailable",
      "429 Too Many Requests",
      "insufficient lamports",
      "custom program error: 0x1", // Add common error code for insufficient funds
      "Transfer: insufficient",
    ];

    // Check if any of the retryable error strings are in the error message or code
    const isRetryable = retryableErrors.some(
      (err) =>
        error.message?.includes(err) ||
        error.code?.includes(err) ||
        (error.name === "TradeError" && error.code === "BLOCKHEIGHT_EXCEEDED")
    );

    // Also check if it's an insufficient funds error
    return isRetryable || this.isInsufficientFundsError(error);
  }
}
