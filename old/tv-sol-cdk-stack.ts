import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { tradingConfigs } from "../lib/config";
import { TradingResources } from "../lib/trading-resources";

export class TvSolCdkStack extends cdk.Stack {
  constructor(
    scope: cdk.App,
    id: string,
    timeframe: string,
    sharedResources: {
      layer: lambda.LayerVersion;
      api: apigateway.RestApi;
      tradeResource: apigateway.Resource;
    },
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

    const lambda = resources.createLambda(role, sharedResources.layer);

    // Add timeframe-specific resource and method
    const timeframeResource = sharedResources.tradeResource.addResource(
      config.timeframe
    );
    timeframeResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(lambda)
    );

    // Add API endpoint to stack outputs
    new cdk.CfnOutput(this, `ApiEndpoint${config.timeframe}`, {
      value: `${sharedResources.api.url}trade/${config.timeframe}`,
      description: `URL for the ${config.timeframe} trading endpoint`,
    });
  }
}
