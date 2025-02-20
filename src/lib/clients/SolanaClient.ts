import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";

export class SolanaClient {
  private connection: Connection;
  private wallet: Keypair;

  constructor(rpcUrl: string, wallet: Keypair) {
    this.connection = new Connection(rpcUrl, "confirmed");
    this.wallet = wallet;
  }

  async getSolBalance(): Promise<number> {
    try {
      return await this.connection.getBalance(this.wallet.publicKey);
    } catch (error) {
      console.error(
        `Error fetching SOL balance for ${this.wallet.publicKey}:`,
        error
      );
      throw error;
    }
  }

  async getTokenBalance(mintAddress: string): Promise<number> {
    try {
      const associatedTokenAddress = await getAssociatedTokenAddress(
        new PublicKey(mintAddress),
        this.wallet.publicKey
      );

      const balance = await this.connection.getTokenAccountBalance(
        associatedTokenAddress
      );

      return Number(balance.value.amount);
    } catch (error) {
      console.error(`Error fetching token balance for ${mintAddress}:`, error);
      throw error;
    }
  }

  async confirmTransaction(signature: string): Promise<boolean> {
    try {
      const latestBlockHash = await this.connection.getLatestBlockhash();
      const confirmation = await this.connection.confirmTransaction(
        {
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: signature,
        },
        "confirmed"
      );
      console.log("Transaction confirmed:", confirmation.value);

      if (
        confirmation.value.err &&
        !confirmation.value.err
          ?.toString()
          .includes("TransactionExpiredTimeoutError")
      ) {
        console.error("Transaction Failed:", confirmation.value.err);
        throw new Error(
          `Transaction failed: ${JSON.stringify(confirmation.value.err)}`
        );
      }

      return true;
    } catch (error) {
      console.error(`Error confirming transaction ${signature}:`, error);
      throw error;
    }
  }

  async sendTransaction(transaction: VersionedTransaction): Promise<string> {
    transaction.sign([this.wallet]);
    const rawTransaction = transaction.serialize();

    return await this.connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 3,
    });
  }
}
