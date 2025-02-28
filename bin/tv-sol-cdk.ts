#!/opt/homebrew/opt/node/bin/node
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { TvSolSharedStack } from "../lib/stacks/shared-stack";
import { TvSolTradingStack } from "../lib/stacks/trading-stack";
import { TvSolApiStack } from "../lib/stacks/api-stack";

const app = new cdk.App();

// Create shared resources stack first
const sharedStack = new TvSolSharedStack(app, "TvSolSharedStack");

// Deploy stacks for different timeframes
const configs = ["2hsol", "3hsol", "3hray"];
const tradingStacks: Record<string, TvSolTradingStack> = {};

configs.forEach((config) => {
  const configName = config.replace(
    /(\d+[hm])([a-z]+)/,
    (_, time, name) =>
      time + name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
  );

  tradingStacks[config] = new TvSolTradingStack(
    app,
    `TvTradingStack${configName}`,
    config,
    sharedStack.layer,
    sharedStack.botLayer
  );
});

// Create API Gateway stack last, with references to all lambdas
const lambdas: Record<string, lambda.Function> = {};
Object.entries(tradingStacks).forEach(([timeframe, stack]) => {
  lambdas[timeframe] = stack.lambda;
});

//TODO: make domain optional
new TvSolApiStack(app, "TvSolApiStack", lambdas, {
  domainName: process.env.DOMAIN_NAME,
  subdomainName: process.env.SUBDOMAIN_NAME,
  hostedZoneId: process.env.HOSTED_ZONE_ID,
  createCustomDomain: true,
});
