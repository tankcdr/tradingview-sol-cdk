import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import { customEnv } from "../config/environment";

export class TvSolApiStack extends cdk.Stack {
  constructor(
    scope: cdk.App,
    id: string,
    lambdas: Record<string, lambda.Function>,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    // Trading View IP addresses
    // plus my public IP address for testing
    const allowedIPs = [
      `${customEnv.PUBLIC_IP}`, // Add your public IP address and CIDR here (well in the config)
      "52.89.214.238/32",
      "34.212.75.30/32",
      "54.218.53.128/32",
      "52.32.178.7/32",
    ];

    // Create API Gateway with deployment options
    const api = new apigateway.RestApi(this, "TradingViewWebhookHandler", {
      restApiName: "TradingView Webhook Handler",
      description:
        "API to receive TradingView alerts and execute trades for all timeframes.",
      deploy: true,
      deployOptions: {
        stageName: "prod",
        description: "Production stage",
      },
      // Define the policy at creation time
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            effect: iam.Effect.DENY,
            principals: [new iam.AnyPrincipal()],
            actions: ["execute-api:Invoke"],
            resources: ["execute-api:/*"],
            conditions: {
              NotIpAddress: {
                "aws:SourceIp": allowedIPs,
              },
            },
          }),
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            principals: [new iam.AnyPrincipal()],
            actions: ["execute-api:Invoke"],
            resources: ["execute-api:/*"],
            conditions: {
              IpAddress: {
                "aws:SourceIp": allowedIPs,
              },
            },
          }),
        ],
      }),
    });

    // Add CORS response
    api.addGatewayResponse("UnauthorizedResponse", {
      type: apigateway.ResponseType.UNAUTHORIZED,
      responseHeaders: {
        "Access-Control-Allow-Origin": "'*'",
      },
    });

    // Create base trade resource
    const tradeResource = api.root.addResource("trade");

    // Add timeframe-specific resources with integration options
    Object.entries(lambdas).forEach(([timeframe, lambdaFn]) => {
      const timeframeResource = tradeResource.addResource(timeframe);
      timeframeResource.addMethod(
        "POST",
        new apigateway.LambdaIntegration(lambdaFn, {
          proxy: true,
          allowTestInvoke: true,
        }),
        {
          methodResponses: [
            {
              statusCode: "200",
              responseParameters: {
                "method.response.header.Access-Control-Allow-Origin": true,
              },
            },
          ],
        }
      );
    });

    // Add API endpoint to stack outputs
    new cdk.CfnOutput(this, "ApiEndpoint", {
      value: api.url,
      description: "Base URL for the trading API",
    });
  }
}
