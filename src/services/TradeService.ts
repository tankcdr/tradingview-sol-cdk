import { JupiterClient, SolanaClient } from "../clients";
import { TokenConfig } from "../config";

export class TradeService {
  private solanaClient: SolanaClient;
  private jupiterClient: JupiterClient;
  private tokenConfig: TokenConfig;

  constructor(
    solanaClient: SolanaClient,
    jupiterClient: JupiterClient,
    tokenConfig: TokenConfig
  ) {
    this.solanaClient = solanaClient;
    this.jupiterClient = jupiterClient;
    this.tokenConfig = tokenConfig;
  }

  async executeTrade(
    inputMint: string,
    outputMint: string,
    amount: number
  ): Promise<{ txId: string; quote: any }> {
    try {
      const quote = await this.jupiterClient.getQuote(
        inputMint,
        outputMint,
        amount
      );
      const transaction = await this.jupiterClient.createSwapTransaction(quote);
      const txId = await this.solanaClient.sendTransaction(transaction);

      try {
        await this.solanaClient.confirmTransaction(txId);
        console.log(`Transaction successful: https://solscan.io/tx/${txId}/`);
      } catch (error) {
        console.warn(
          `Transaction confirmation error, but trade may still be successful: ${error}`
        );
      }

      return { txId, quote };
    } catch (error) {
      console.error("Error executing trade:", error);
      throw new Error("Trade execution failed");
    }
  }
}
