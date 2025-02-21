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
const timeframes = ["2h", "3h"];
const tradingStacks: Record<string, TvSolTradingStack> = {};

timeframes.forEach((timeframe) => {
  tradingStacks[timeframe] = new TvSolTradingStack(
    app,
    `TvSolTradingStack${timeframe}`,
    timeframe,
    sharedStack.layer
  );
});

// Create API Gateway stack last, with references to all lambdas
const lambdas: Record<string, lambda.Function> = {};
Object.entries(tradingStacks).forEach(([timeframe, stack]) => {
  lambdas[timeframe] = stack.lambda;
});

new TvSolApiStack(app, "TvSolApiStack", lambdas);
