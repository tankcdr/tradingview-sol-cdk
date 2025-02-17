import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import path = require("path");
import * as fs from "fs";
import * as child_process from "child_process";

export class SharedResources {
  static createApiGateway(scope: cdk.Stack) {
    const allowedIPs = [
      "YOUR_PUBLIC_IP/32",
      "52.89.214.238/32",
      "34.212.75.30/32",
      "54.218.53.128/32",
      "52.32.178.7/32",
    ];

    const apiPolicyDocument = new iam.PolicyDocument();

    // Create API Gateway
    const api = new apigateway.RestApi(scope, "TradingViewWebhookHandler", {
      restApiName: "TradingView Webhook Handler",
      description:
        "API to receive TradingView alerts and execute trades for all timeframes.",
      policy: apiPolicyDocument,
    });

    api.addGatewayResponse("UnauthorizedResponse", {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
      },
    });

    apiPolicyDocument.addStatements(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ["execute-api:Invoke"],
        resources: [api.arnForExecuteApi()],
        conditions: {
          NotIpAddress: {
            "aws:SourceIp": allowedIPs,
          },
        },
      })
    );

    // Create base trade resource
    const tradeResource = api.root.addResource("trade");

    return { api, tradeResource };
  }

  static createSolanaLayer(scope: cdk.Stack) {
    const solanaLayerPath = path.join(__dirname, "../solana-layer");
    const solanaLayerZip = path.join(__dirname, "../solana-layer.zip");

    if (!fs.existsSync(solanaLayerPath)) {
      fs.mkdirSync(solanaLayerPath, { recursive: true });
      fs.mkdirSync(path.join(solanaLayerPath, "nodejs"));
      child_process.execSync("npm init -y", {
        cwd: path.join(solanaLayerPath, "nodejs"),
      });
      child_process.execSync("npm install @solana/web3.js @solana/spl-token", {
        cwd: path.join(solanaLayerPath, "nodejs"),
      });
    }
    child_process.execSync(`zip -r ${solanaLayerZip} nodejs`, {
      cwd: solanaLayerPath,
    });

    return new lambda.LayerVersion(scope, "SolanaLambdaLayer", {
      code: lambda.Code.fromAsset(solanaLayerZip),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      description: "Solana dependencies for Lambda",
    });
  }
}
