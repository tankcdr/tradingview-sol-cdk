import { JupiterClient, SolanaClient, TradePairInterface } from "@bot/index.js";

interface TradeResult {
  txId: string;
  quote: any;
  retryCount?: number;
  inputToken?: string;
  outputToken?: string;
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
  private readonly defaultMaxRetries: number;
  private readonly baseRetryDelayMs: number;
  private readonly basePriorityFee: number = 10000; // Base priority fee in micro-lamports per compute unit

  constructor(
    solanaClient: SolanaClient,
    jupiterClient: JupiterClient,
    defaultMaxRetries: number = 3,
    baseRetryDelayMs: number = 1000
  ) {
    this.defaultMaxRetries = defaultMaxRetries;
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
    pairConfig: TradePairInterface,
    amount: number,
    retryCount = 0
  ): Promise<TradeResult> {
    // Use pair config or fall back to defaults
    const maxRetries = pairConfig?.maxRetries || this.defaultMaxRetries;

    const { inputToken, outputToken } = pairConfig;

    console.log(
      `[Trade] Starting ${inputToken.SYMBOL}-${
        outputToken.SYMBOL
      } trade execution (attempt ${retryCount + 1})`
    );
    console.log(
      `[Trade] Parameters: inputMint=${inputToken.MINT}, outputMint=${outputToken.MINT}, amount=${amount}`
    );

    try {
      // Check minimum amount requirements
      if (pairConfig && amount < pairConfig.minAmountIn) {
        throw new TradeError(
          `Amount too small: ${amount} ${inputToken.SYMBOL} (minimum: ${pairConfig.minAmountIn})`,
          "AMOUNT_TOO_SMALL"
        );
      }

      // Get quote from Jupiter with token-specific slippage tolerance
      const slippageBps = inputToken.SLIPPAGE_TOLERANCE * 100; // Convert to basis points

      const quote = await this.jupiterClient.getQuote(
        inputToken.MINT,
        outputToken.MINT,
        amount,
        {
          slippageBps,
          onlyDirectRoutes: true,
        }
      );

      console.log("[Trade] Quote received:", JSON.stringify(quote, null, 2));

      // Calculate priority fee: doubles with each retry (10,000 → 20,000 → 40,000, etc.)
      const priorityFee = this.basePriorityFee * Math.pow(2, retryCount);
      console.log(
        `[Trade] Using priority fee: ${priorityFee} micro-lamports per compute unit`
      );

      // Create swap transaction
      const transaction = await this.jupiterClient.createSwapTransaction(
        quote,
        priorityFee
      );
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
        return {
          txId,
          quote,
          retryCount,
          inputToken: inputToken.SYMBOL,
          outputToken: outputToken.SYMBOL,
        };
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
        return {
          txId: "timeout",
          quote: null,
          retryCount,
          inputToken: inputToken.SYMBOL,
          outputToken: outputToken.SYMBOL,
        };
      }

      // Check if retryable and we haven't exceeded max retries for this pair
      if (this.isRetryableError(error) && retryCount < maxRetries) {
        const delay = this.baseRetryDelayMs * Math.pow(2, retryCount);
        console.log(`[Trade] Retrying in ${delay}ms...`);

        // For insufficient funds errors, we should get a fresh quote as the price might have changed
        if (this.isInsufficientFundsError(error)) {
          console.log(
            "[Trade] Insufficient funds detected - Will retry with a fresh quote"
          );

          // Use token-specific adjustment factor
          const adjustmentFactor = inputToken.RETRY_AMOUNT_ADJUSTMENT;
          const adjustedAmount = Math.floor(amount * adjustmentFactor);

          console.log(
            `[Trade] Adjusting ${
              inputToken.SYMBOL
            } amount from ${amount} to ${adjustedAmount} (${
              (1 - adjustmentFactor) * 100
            }% reduction)`
          );

          await this.sleep(delay);
          return this.executeTrade(pairConfig, adjustedAmount, retryCount + 1);
        }

        // For other retryable errors, just retry with the same amount
        await this.sleep(delay);
        return this.executeTrade(pairConfig, amount, retryCount + 1);
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
      errorMessage.includes("0x1") || // Common error code for insufficient funds
      errorMessage.includes("insufficient") ||
      errorMessage.includes("Insufficient") ||
      errorMessage.includes("InsufficientFunds")
    ) {
      return true;
    }

    // Check the logs if available
    if (errorLogs) {
      for (const log of errorLogs) {
        if (
          log.includes("insufficient lamports") ||
          log.includes("Transfer: insufficient") ||
          log.includes("Insufficient")
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
      "block height exceeded",
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
      "Insufficient",
      "Price impact exceeds", // For high price impact errors
      "slippage tolerance exceeded", // For slippage issues
    ];

    // Check if any of the retryable error strings are in the error message or code
    const isRetryable = retryableErrors.some(
      (err) =>
        error.name === err ||
        error.message?.includes(err) ||
        error.code?.includes(err) ||
        (error.name === "TradeError" && error.code === "BLOCKHEIGHT_EXCEEDED")
    );
    console.log("[TradeService] Is retryable:", isRetryable);
    // Also check if it's an insufficient funds error
    return isRetryable || this.isInsufficientFundsError(error);
  }
}
