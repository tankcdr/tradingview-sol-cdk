import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";

export class TvSolApiStack extends cdk.Stack {
  constructor(
    scope: cdk.App,
    id: string,
    lambdas: Record<string, lambda.Function>,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    const allowedIPs = [
      "YOUR_PUBLIC_IP/32",
      "52.89.214.238/32",
      "34.212.75.30/32",
      "54.218.53.128/32",
      "52.32.178.7/32",
    ];

    const apiPolicyDocument = new iam.PolicyDocument();

    // Create API Gateway
    const api = new apigateway.RestApi(this, "TradingViewWebhookHandler", {
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

    // Add timeframe-specific resources
    Object.entries(lambdas).forEach(([timeframe, lambda]) => {
      const timeframeResource = tradeResource.addResource(timeframe);
      timeframeResource.addMethod(
        "POST",
        new apigateway.LambdaIntegration(lambda)
      );
    });

    // Add API endpoint to stack outputs
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: api.url,
      description: "Base URL for the trading API",
    });
  }
}
