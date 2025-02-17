import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import { TradingConfig } from "../types";

export class TradingResources {
  constructor(
    private readonly scope: cdk.Stack,
    private readonly config: TradingConfig
  ) {}

  createParameterStore() {
    return new ssm.StringParameter(
      this.scope,
      `TradingStateParam${this.config.timeframe}`,
      {
        parameterName: this.config.parameterPath,
        stringValue: this.config.defaultTradingState || "NONE",
        description: "Stores the current trading state (BUY or SELL)",
      }
    );
  }

  createSecret() {
    return new secretsmanager.Secret(
      this.scope,
      `TradingWalletSecret${this.config.timeframe}`,
      {
        secretName: this.config.secretPath,
        generateSecretString: {
          secretStringTemplate: this.config.defaultWalletSecret || "NONE",
          generateStringKey: "wallet_private_key",
        },
      }
    );
  }

  createLambdaRole(
    paramStore: ssm.StringParameter,
    secret: secretsmanager.Secret
  ) {
    const role = new iam.Role(
      this.scope,
      `TradingLambdaRole${this.config.timeframe}`,
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );
    paramStore.grantRead(role);
    paramStore.grantWrite(role);
    secret.grantRead(role);

    return role;
  }

  createLambda(role: iam.Role, layer: lambda.LayerVersion) {
    return new lambda.Function(
      this.scope,
      `TradingLambda${this.config.timeframe}`,
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(path.join(__dirname, "../../src/lambda")),
        role: role,
        environment: {
          TIMEFRAME: this.config.timeframe,
          PARAM_NAME: this.config.parameterPath,
          SECRET_NAME: this.config.secretPath,
          SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
        },
        layers: [layer],
      }
    );
  }
}
