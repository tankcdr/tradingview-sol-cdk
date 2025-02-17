import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import path = require("path");
import * as fs from "fs";
import * as child_process from "child_process";

export class SharedResources {
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
