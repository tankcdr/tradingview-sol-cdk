import { Keypair, VersionedTransaction } from "@solana/web3.js";
import { createJupiterApiClient, SwapApi, QuoteResponse } from "@jup-ag/api";

interface QuoteOptions {
  slippageBps?: number;
  onlyDirectRoutes?: boolean;
  excludeDexes?: string[];
  maxAccounts?: number;
}

export class JupiterClient {
  private apiUrl: string;
  private wallet: Keypair;
  private readonly jupiterApi: SwapApi;

  constructor(apiUrl: string, wallet: Keypair) {
    this.apiUrl = apiUrl;
    this.wallet = wallet;

    //TODO: add configuration options for devnet, etc
    this.jupiterApi = createJupiterApiClient();
  }

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number,
    options: QuoteOptions = {}
  ): Promise<QuoteResponse> {
    try {
      // Prepare quote parameters
      const quoteParams = {
        inputMint,
        outputMint,
        amount,
        slippageBps: options.slippageBps ?? 50, // Default slippage of 0.5% (50 basis points) if not specified
        onlyDirectRoutes: options.onlyDirectRoutes || false,
        excludeDexes: options.excludeDexes,
        maxAccounts: options.maxAccounts,
      };

      // Get quote from Jupiter API
      const quote = await this.jupiterApi.quoteGet(quoteParams);

      if (!quote || !quote.routePlan || quote.routePlan.length === 0) {
        throw new Error(`No routes found for ${inputMint} -> ${outputMint}`);
      }

      return quote;
    } catch (error) {
      console.error("[JupiterClient] Error getting quote:", error);
      throw error;
    }
  }

  async createSwapTransaction(
    quote: QuoteResponse,
    computeUnitPriceMicroLamports?: number
  ): Promise<VersionedTransaction> {
    try {
      // Get swap transaction
      const swapResult = await this.jupiterApi.swapPost({
        swapRequest: {
          quoteResponse: quote,
          userPublicKey: this.wallet.publicKey.toBase58(),
          wrapAndUnwrapSol: true, // Automatically handle SOL wrapping/unwrapping
          computeUnitPriceMicroLamports,
        },
      });

      if (!swapResult.swapTransaction) {
        throw new Error("No swap transaction returned from Jupiter");
      }

      // Deserialize the transaction
      const swapTransaction = VersionedTransaction.deserialize(
        Buffer.from(swapResult.swapTransaction, "base64")
      );

      return swapTransaction;
    } catch (error) {
      console.error("[JupiterClient] Error creating swap transaction:", error);
      throw error;
    }
  }
}
