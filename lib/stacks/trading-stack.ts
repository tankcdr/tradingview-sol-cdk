import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { tradingConfigs } from "../config/config";
import { TradingResources } from "../resources/trading-resources";

export class TvSolTradingStack extends cdk.Stack {
  public readonly lambda: lambda.Function;

  constructor(
    scope: cdk.App,
    id: string,
    timeframe: string,
    resourceLayer: lambda.LayerVersion,
    libraryLayer: lambda.LayerVersion,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    const config = tradingConfigs[timeframe];
    if (!config) {
      throw new Error(`No configuration found for timeframe: ${timeframe}`);
    }

    const resources = new TradingResources(this, config);

    // Create resources
    const paramStore = resources.createParameterStore();
    const secret = resources.createSecret();
    const role = resources.createLambdaRole(paramStore, secret);
    this.lambda = resources.createLambda(role, resourceLayer, libraryLayer);
  }
}
