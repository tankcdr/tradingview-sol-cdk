import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import path = require("path");
import * as fs from "fs";
import * as child_process from "child_process";

export class SharedResources {
  static createSolanaLayer(scope: cdk.Stack) {
    const solanaLayerPath = path.join(__dirname, "../../build/solana-layer");
    const solanaLayerZip = path.join(__dirname, "../../build/solana-layer.zip");

    if (!fs.existsSync(solanaLayerPath)) {
      fs.mkdirSync(solanaLayerPath, { recursive: true });
      fs.mkdirSync(path.join(solanaLayerPath, "nodejs"));
      child_process.execSync("npm init -y", {
        cwd: path.join(solanaLayerPath, "nodejs"),
      });
      child_process.execSync(
        "npm install @solana/web3.js @solana/spl-token bs58",
        {
          cwd: path.join(solanaLayerPath, "nodejs"),
        }
      );
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

  static createBotLayer(scope: cdk.Stack) {
    const baseLayerPath = path.join(__dirname, "../../");
    const botLayerPath = path.join(__dirname, "../../build/bot-layer");
    const botLayerZip = path.join(__dirname, "../../build/bot-layer.zip");
    const nodejsPath = path.join(botLayerPath, "nodejs");
    const botPath = path.join(nodejsPath, "@bot");

    if (!fs.existsSync(botLayerPath)) {
      fs.mkdirSync(botLayerPath, { recursive: true });
      fs.mkdirSync(nodejsPath);
      fs.mkdirSync(botPath);
    }
    //ensure the bot layer is build
    child_process.execSync("npm run build", { cwd: baseLayerPath });
    //copy built library to the layer
    child_process.execSync("cp -r target/lib/* build/bot-layer/nodejs/@bot", {
      cwd: baseLayerPath,
    });
    child_process.execSync(`zip -r ${botLayerZip} nodejs`, {
      cwd: botLayerPath,
    });

    return new lambda.LayerVersion(scope, "BotLibLayer", {
      code: lambda.Code.fromAsset(botLayerZip),
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      description: "Bot library dependencies for Lambda",
    });
  }
}
