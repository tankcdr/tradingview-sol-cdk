import {
  Commitment,
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
    console.log("Creating Solana client with RPC URL:", rpcUrl);
    this.connection = new Connection(rpcUrl, "confirmed");
    this.wallet = wallet;
  }

  getConnection(): Connection {
    return this.connection;
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

  // Simplified confirmTransaction method using the deprecated but reliable approach
  async confirmTransaction(
    signature: string,
    commitment: Commitment = "confirmed"
  ): Promise<boolean> {
    try {
      console.log(`[SolanaClient] Confirming transaction: ${signature}`);

      // Using the deprecated but reliable confirmTransaction method
      // @ts-ignore - Using deprecated method intentionally as it works better
      const confirmation = await this.connection.confirmTransaction(
        signature,
        commitment
      );

      // Check if the transaction was confirmed successfully
      if (
        confirmation &&
        confirmation.value &&
        confirmation.value.err === null
      ) {
        console.log(`[SolanaClient] Transaction confirmed successfully`);
        return true;
      } else {
        console.warn(
          `[SolanaClient] Transaction failed to confirm: ${JSON.stringify(
            confirmation?.value?.err || confirmation
          )}`
        );
        return false;
      }
    } catch (error) {
      console.error(`[SolanaClient] Error confirming transaction:`, error);
      return false;
    }
  }

  async sendTransaction(
    transaction: VersionedTransaction,
    p0: { maxRetries: number; skipPreflight: boolean }
  ): Promise<string> {
    transaction.sign([this.wallet]);
    const rawTransaction = transaction.serialize();

    return await this.connection.sendRawTransaction(rawTransaction, p0);
  }
}
