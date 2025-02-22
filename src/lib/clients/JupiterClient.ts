import { Keypair, VersionedTransaction } from "@solana/web3.js";

export class JupiterClient {
  private apiUrl: string;
  private wallet: Keypair;

  constructor(apiUrl: string, wallet: Keypair) {
    this.apiUrl = apiUrl;
    this.wallet = wallet;
  }

  async getQuote(
    inputMint: string,
    outputMint: string,
    amount: number
  ): Promise<any> {
    const response = await fetch(
      `${this.apiUrl}/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50&restrictIntermediateTokens=true`
    );
    return await response.json();
  }

  async createSwapTransaction(quote: any): Promise<VersionedTransaction> {
    const swapResponse = await fetch(`${this.apiUrl}/swap/v1/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: this.wallet.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        dynamicSlippage: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 1000000,
            priorityLevel: "veryHigh",
          },
        },
      }),
    });

    const swap = await swapResponse.json();
    const swapTransactionBuf = Buffer.from(swap.swapTransaction, "base64");
    return VersionedTransaction.deserialize(swapTransactionBuf);
  }
}
