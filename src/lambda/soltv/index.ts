import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
  SSMClient,
  PutParameterCommand,
  GetParameterCommand,
} from "@aws-sdk/client-ssm";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { SolanaClient, JupiterClient } from "@bot";
import { TradeService } from "../../services";
import { TOKEN_CONFIG } from "../../config";

export const handler = async (event: any) => {
  const {
    JUPITER_API_URL,
    SOLANA_RPC_URL,
    PARAMETER_TRADE_STATE,
    SECRET_WALLET_PK,
    TIMEFRAME,
  } = process.env;

  try {
    // Validate environment and event
    if (!validateEnvironment({ event, env: process.env })) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Invalid environment configuration" }),
      };
    }

    // Initialize managers and clients
    const walletManager = new WalletManager(SECRET_WALLET_PK!);
    const stateManager = new TradeStateManager(PARAMETER_TRADE_STATE!);
    const wallet = await walletManager.getWallet();

    const solanaClient = new SolanaClient(SOLANA_RPC_URL!, wallet);
    const jupiterClient = new JupiterClient(JUPITER_API_URL!, wallet);
    const tradeService = new TradeService(
      solanaClient,
      jupiterClient,
      TOKEN_CONFIG
    );

    // Get current state
    const lastState = await stateManager.getState();
    console.log(`Current stored state: ${lastState}`);

    // Parse and validate alert
    const alert = JSON.parse(event.body);
    const { time, action, asset } = alert;

    try {
      validateAlert({ time, action, asset, expectedTimeframe: TIMEFRAME! });
    } catch (error) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: (error as Error).message }),
      };
    }

    // Check if trade is needed
    if (action === lastState) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No trade executed, state unchanged" }),
      };
    }

    // Execute trade based on action
    let trade;
    if (action === "BUY" && lastState === "SELL") {
      const usdcBalance = await solanaClient.getTokenBalance(
        TOKEN_CONFIG.USDC_MINT
      );
      if (usdcBalance > 0) {
        trade = await tradeService.executeTrade(
          TOKEN_CONFIG.USDC_MINT,
          TOKEN_CONFIG.SOL_MINT,
          usdcBalance
        );
        await stateManager.updateState("BUY");
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Insufficient USDC." }),
        };
      }
    } else if (action === "SELL" && lastState === "BUY") {
      const solBalance = await solanaClient.getSolBalance();
      const amountToSwap = Math.floor(solBalance / 2);

      if (amountToSwap > 100_000_000) {
        trade = await tradeService.executeTrade(
          TOKEN_CONFIG.SOL_MINT,
          TOKEN_CONFIG.USDC_MINT,
          amountToSwap
        );
        await stateManager.updateState("SELL");
      } else {
        return {
          statusCode: 400,
          body: JSON.stringify({ message: "Insufficient SOL." }),
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Trade executed successfully", trade }),
    };
  } catch (error) {
    console.error("Error processing alert:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};

function validateEnvironment({
  event,
  env,
}: {
  event: any;
  env: NodeJS.ProcessEnv;
}): boolean {
  const requiredEnvVars = [
    "PARAMETER_TRADE_STATE",
    "SECRET_WALLET_PK",
    "TIMEFRAME",
  ];
  const hasAllEnvVars = requiredEnvVars.every((varName) => env[varName]);
  return hasAllEnvVars && !!event.body;
}

function validateAlert({
  time,
  action,
  asset,
  expectedTimeframe,
}: {
  time: string;
  action: string;
  asset: string;
  expectedTimeframe: string;
}): boolean {
  if (!time || !action || !asset) {
    throw new Error("Error: Invalid alert - Missing required fields");
  }

  if (time !== expectedTimeframe) {
    throw new Error(
      `Error: Timeframe is incorrect: Expect ${expectedTimeframe}, received ${time}`
    );
  }

  if (asset !== "SOL") {
    throw new Error("Error: Unsupported asset - Only SOL is supported");
  }

  return true;
}

class TradeStateManager {
  private ssm: SSMClient;
  private parameterPath: string;

  constructor(parameterPath: string) {
    this.ssm = new SSMClient({});
    this.parameterPath = parameterPath;
  }

  async getState(): Promise<string> {
    try {
      const response = await this.ssm.send(
        new GetParameterCommand({
          Name: this.parameterPath,
        })
      );
      return response.Parameter?.Value || "NONE";
    } catch (error) {
      console.error("Error retrieving state:", error);
      throw new Error("Failed to retrieve state.");
    }
  }

  async updateState(state: string): Promise<void> {
    await this.ssm.send(
      new PutParameterCommand({
        Name: this.parameterPath,
        Value: state,
        Type: "String",
        Overwrite: true,
      })
    );
  }
}

class WalletManager {
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
