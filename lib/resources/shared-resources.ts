import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as fs from "fs";
import * as child_process from "child_process";

export class SharedResources {
  static createSolanaLayer(scope: cdk.Stack) {
    const solanaLayerPath = path.join(
      __dirname,
      "../../target/layer/solana-layer"
    );
    const solanaLayerZip = path.join(
      __dirname,
      "../../target/layer/solana-layer.zip"
    );

    if (!fs.existsSync(solanaLayerPath)) {
      fs.mkdirSync(solanaLayerPath, { recursive: true });
      fs.mkdirSync(path.join(solanaLayerPath, "nodejs"));
      child_process.execSync("npm init -y", {
        cwd: path.join(solanaLayerPath, "nodejs"),
      });
      child_process.execSync(
        "npm install @solana/web3.js @solana/spl-token @jup-ag/api bs58",
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
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      layerVersionName: "deps-layer",
      compatibleArchitectures: [lambda.Architecture.ARM_64],
    });
  }

  static createBotLayer(scope: cdk.Stack) {
    const botLayer = new lambda.LayerVersion(scope, "bot-layer-construct", {
      compatibleRuntimes: [lambda.Runtime.NODEJS_22_X],
      description: "BotLayer",
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      code: lambda.Code.fromAsset(path.join(__dirname, "/../../target/@bot"), {
        bundling: {
          image: lambda.Runtime.NODEJS_22_X.bundlingImage,
          user: "root",
          command: [
            "bash",
            "-c",
            [
              "mkdir -p /asset-output/nodejs/node_modules/@bot",
              "npm init -y",
              "cp package.json /asset-output/nodejs/node_modules/@bot",
              "cp -r * /asset-output/nodejs/node_modules/@bot/",
            ].join(" && "),
          ],
        },
      }),
      layerVersionName: `bot-layer`,
      compatibleArchitectures: [lambda.Architecture.ARM_64],
    });

    return botLayer;
  }
}
