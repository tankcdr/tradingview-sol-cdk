import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejsLambda from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";
import { TradingConfig } from "../types";
import { customEnv } from "../config/environment";
import { Stack } from "aws-cdk-lib";

export class TradingResources {
  constructor(
    private readonly scope: Stack,
    private readonly config: TradingConfig
  ) {}

  createParameterStore() {
    return new ssm.StringParameter(
      this.scope,
      `TradingStateParam${this.config.name}`,
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
      `TradingWalletSecret${this.config.name}`,
      {
        secretName: this.config.secretPath,
      }
    );
  }

  createLambdaRole(
    paramStore: ssm.StringParameter,
    secret: secretsmanager.Secret
  ) {
    const role = new iam.Role(
      this.scope,
      `TradingLambdaRole${this.config.name}`,
      {
        assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      }
    );

    role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );

    // Add explicit permission for GetSecretValue
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [secret.secretArn],
      })
    );

    paramStore.grantRead(role);
    paramStore.grantWrite(role);
    secret.grantRead(role);

    return role;
  }

  createLambda(
    role: iam.Role,
    layer: lambda.LayerVersion,
    botLayer: lambda.LayerVersion
  ) {
    const logGroup = new logs.LogGroup(
      this.scope,
      `TradingLambdaLogs${this.config.name}`,
      {
        logGroupName: `/aws/lambda/TradingLambda${this.config.name}`,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
        retention: logs.RetentionDays.THREE_DAYS,
      }
    );

    return new nodejsLambda.NodejsFunction(
      this.scope,
      `TradingLambda${this.config.name}`,
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "handler",
        timeout: cdk.Duration.minutes(5),
        role,
        logGroup,
        environment: {
          TIMEFRAME: this.config.timeframe,
          PARAMETER_TRADE_STATE: this.config.parameterPath,
          SECRET_WALLET_PK: this.config.secretPath,
          SOLANA_RPC_URL: customEnv.SOLANA_RPC_URL,
          JUPITER_API_URL: customEnv.JUPITER_API_URL,
        },
        layers: [layer, botLayer],
        architecture: lambda.Architecture.ARM_64,
        entry: path.join(
          __dirname,
          "..",
          "..",
          "src",
          "lambda",
          "soltv",
          "index.ts"
        ),
        bundling: {
          externalModules: [
            "@aws-sdk/*",
            "@solana/web3.js",
            "@solana/spl-token",
            "@jup-ag/api",
            "bs58",
            "@bot",
          ],
          format: cdk.aws_lambda_nodejs.OutputFormat.CJS,
        },
      }
    );
  }
}
