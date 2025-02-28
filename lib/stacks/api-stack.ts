import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { customEnv } from "../config/environment";

export interface TvSolApiStackProps extends cdk.StackProps {
  domainName?: string; // Your root domain (e.g., example.com)
  subdomainName?: string; // Your subdomain (e.g., api)
  hostedZoneId?: string; // Optional: If you already know your hosted zone ID
  createCustomDomain: boolean; // Flag to control whether to create custom domain
}

export class TvSolApiStack extends cdk.Stack {
  constructor(
    scope: cdk.App,
    id: string,
    lambdas: Record<string, lambda.Function>,
    props: TvSolApiStackProps
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

    // Default to true if not specified
    const createCustomDomain = props.createCustomDomain !== false;

    // Custom domain configuration
    let domainOptions: apigateway.RestApiProps["domainName"] = undefined;

    // Setup Route53 and custom domain if requested
    let hostedZone: route53.IHostedZone | undefined;
    let certificate: acm.ICertificate | undefined;

    if (createCustomDomain && props.domainName) {
      // The subdomain we want to use
      const fullDomainName = `${props.subdomainName}.${props.domainName}`;

      // Get the hosted zone - either by ID or by domain name
      if (props.hostedZoneId) {
        hostedZone = route53.HostedZone.fromHostedZoneAttributes(
          this,
          "HostedZone",
          {
            zoneName: props.domainName,
            hostedZoneId: props.hostedZoneId,
          }
        );
      } else {
        // Look up the hosted zone by domain name
        hostedZone = route53.HostedZone.fromLookup(
          this,
          "TradingViewWebhookHostedZone",
          {
            domainName: props.domainName,
          }
        );
      }

      // Create a certificate for the subdomain using the non-deprecated Certificate class
      certificate = new acm.Certificate(
        this,
        "TradingViewWebhookApiCertificate",
        {
          domainName: fullDomainName,
          validation: acm.CertificateValidation.fromDns(hostedZone),
          // API Gateway in regions other than us-east-1 require certificates in that region
        }
      );

      // Prepare domain configuration for API Gateway
      domainOptions = {
        domainName: fullDomainName,
        certificate,
        endpointType: apigateway.EndpointType.REGIONAL,
        securityPolicy: apigateway.SecurityPolicy.TLS_1_2,
      };
    }

    // Create API Gateway with deployment options
    const api = new apigateway.RestApi(this, "TradingViewWebhookHandlerAPI", {
      restApiName: "TradingView Webhook Handler",
      description:
        "API to receive TradingView alerts and execute trades for all timeframes.",
      deploy: true,
      deployOptions: {
        stageName: "prod",
        description: "Production stage",
      },
      domainName: domainOptions,
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
    new cdk.CfnOutput(this, "TrandingViewApiEndpoint", {
      value: api.url,
      description: "Base URL for the trading API",
    });
  }
}
