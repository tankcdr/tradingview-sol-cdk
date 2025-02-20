import {
  Connection,
  VersionedTransaction,
  TransactionSignature,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import { JupiterClient, SolanaClient, TokenConfig } from "@bot/index";

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

  constructor(
    solanaClient: SolanaClient,
    jupiterClient: JupiterClient,
    maxRetries: number = 1
  ) {
    this.maxRetries = maxRetries;
    this.solanaClient = solanaClient;
    this.jupiterClient = jupiterClient;
  }

  // Utility to sleep for polling
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Custom confirmation method
  private async sendAndConfirmVersionedTransaction(
    transaction: VersionedTransaction,
    connection: Connection, // Assume SolanaClient provides this
    maxRetries: number = 5,
    timeoutMs: number = 60000
  ): Promise<{ signature: TransactionSignature; confirmed: boolean }> {
    // Add priority fee
    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: 100000, // Adjust as needed
    });
    transaction.message.recentBlockhash = latestBlockhash.blockhash;
    // Note: Assuming transaction is already signed by jupiterClient

    // Send transaction
    const signature = await this.solanaClient.sendTransaction(transaction, {
      maxRetries,
      skipPreflight: false,
    });
    console.log(`[Trade] Transaction sent: ${signature}`);

    // Poll for confirmation
    const startTime = Date.now();
    const lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

    while (Date.now() - startTime < timeoutMs) {
      const statusResponse = await connection.getSignatureStatus(signature);
      const status = statusResponse.value;

      if (status) {
        if (status.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.err)}`);
        }
        if (
          status.confirmationStatus === "confirmed" ||
          status.confirmationStatus === "finalized"
        ) {
          console.log(
            `[Trade] Confirmed at ${status.confirmationStatus} level`
          );
          return { signature, confirmed: true };
        }
      }

      // Check blockhash expiration
      const currentBlockHeight = await connection.getBlockHeight("confirmed");
      if (currentBlockHeight > lastValidBlockHeight) {
        console.log("[Trade] Block height exceeded");
        const txDetails = await connection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });
        if (txDetails && !txDetails.meta?.err) {
          console.log("[Trade] Transaction landed despite expiration");
          return { signature, confirmed: true };
        }
        return { signature, confirmed: false };
      }

      await this.sleep(2000); // Poll every 2 seconds
    }

    throw new Error(`Confirmation timed out after ${timeoutMs}ms`);
  }

  async executeTrade(
    inputMint: string,
    outputMint: string,
    amount: number,
    retryCount = 0
  ): Promise<TradeResult> {
    try {
      console.log(
        `[Trade] Starting trade execution (attempt ${retryCount + 1})`
      );
      console.log(
        `[Trade] Parameters: inputMint=${inputMint}, outputMint=${outputMint}, amount=${amount}`
      );

      const quote = await this.getQuoteWithRetry(inputMint, outputMint, amount);
      console.log("[Trade] Quote received:", JSON.stringify(quote, null, 2));

      const transaction = await this.jupiterClient.createSwapTransaction(quote);
      console.log("[Trade] Swap transaction created");

      // Assume SolanaClient exposes a connection property (adjust if needed)
      const connection = (this.solanaClient as any).connection as Connection;
      if (!connection) {
        throw new Error("SolanaClient connection not available");
      }

      const { signature: txId, confirmed } =
        await this.sendAndConfirmVersionedTransaction(transaction, connection);
      console.log(`[Trade] Transaction sent with ID: ${txId}`);

      if (confirmed) {
        console.log(
          `[Trade] Transaction confirmed successfully: https://solscan.io/tx/${txId}/`
        );
        return { txId, quote, retryCount };
      } else {
        return await this.handleConfirmationError(
          new Error("TransactionExpiredBlockheightExceededError"),
          inputMint,
          outputMint,
          amount,
          txId,
          quote,
          retryCount
        );
      }
    } catch (error: any) {
      return await this.handleExecutionError(
        error,
        inputMint,
        outputMint,
        amount,
        retryCount
      );
    }
  }

  private async getQuoteWithRetry(
    inputMint: string,
    outputMint: string,
    amount: number
  ): Promise<any> {
    try {
      return await this.jupiterClient.getQuote(inputMint, outputMint, amount);
    } catch (error) {
      console.error("[Trade] Error getting quote:", error);
      throw new TradeError("Failed to get quote", "QUOTE_ERROR");
    }
  }

  private async handleConfirmationError(
    error: any,
    inputMint: string,
    outputMint: string,
    amount: number,
    txId: string,
    quote: any,
    retryCount: number
  ): Promise<TradeResult> {
    const errorMessage = error.toString();
    console.log(`[Trade] Confirmation error encountered: ${errorMessage}`);

    if (errorMessage.includes("TransactionExpiredTimeoutError")) {
      console.log("[Trade] Transaction timeout - Considering successful");
      return { txId, quote, retryCount };
    }

    if (errorMessage.includes("TransactionExpiredBlockheightExceededError")) {
      console.log("[Trade] Block height exceeded - Attempting retry");
      return await this.handleRetry(
        inputMint,
        outputMint,
        amount,
        retryCount,
        "BLOCKHEIGHT_EXCEEDED"
      );
    }

    if (errorMessage.includes("InstructionError")) {
      console.log("[Trade] Instruction error - Attempting retry");
      return await this.handleRetry(
        inputMint,
        outputMint,
        amount,
        retryCount,
        "INSTRUCTION_ERROR"
      );
    }

    console.error("[Trade] Unknown confirmation error:", error);
    throw new TradeError(
      `Transaction confirmation failed: ${errorMessage}`,
      "CONFIRMATION_ERROR"
    );
  }

  private async handleExecutionError(
    error: any,
    inputMint: string,
    outputMint: string,
    amount: number,
    retryCount: number
  ): Promise<TradeResult> {
    console.error("[Trade] Execution error:", error);
    return await this.handleRetry(
      inputMint,
      outputMint,
      amount,
      retryCount,
      "EXECUTION_ERROR"
    );
  }

  private async handleRetry(
    inputMint: string,
    outputMint: string,
    amount: number,
    retryCount: number,
    errorCode: string
  ): Promise<TradeResult> {
    if (retryCount < this.maxRetries) {
      console.log(
        `[Trade] Attempting retry ${retryCount + 1} of ${this.maxRetries}`
      );
      return await this.executeTrade(
        inputMint,
        outputMint,
        amount,
        retryCount + 1
      );
    }

    console.error(`[Trade] Max retries (${this.maxRetries}) exceeded`);
    throw new TradeError(
      `Max retries exceeded for operation: ${errorCode}`,
      errorCode
    );
  }
}
