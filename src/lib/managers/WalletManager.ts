import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

export class WalletManager {
  private secretsManager: SecretsManagerClient;
  private secretPath: string;

  constructor(secretPath: string) {
    this.secretsManager = new SecretsManagerClient({});
    this.secretPath = secretPath;
  }

  async getWallet(): Promise<Keypair> {
    try {
      const secret = await this.secretsManager.send(
        new GetSecretValueCommand({
          SecretId: this.secretPath,
          VersionStage: "AWSCURRENT",
        })
      );

      if (!secret.SecretString) {
        throw new Error("Secret string is undefined");
      }

      const parsedSecret = bs58.decode(secret.SecretString);
      return Keypair.fromSecretKey(parsedSecret);
    } catch (error) {
      console.error("Error fetching private key from Secrets Manager:", error);
      throw new Error("Failed to retrieve private key.");
    }
  }
}
