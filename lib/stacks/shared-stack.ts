import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SharedResources } from "../resources/shared-resources";

export class TvSolSharedStack extends cdk.Stack {
  public readonly layer: lambda.LayerVersion;
  public readonly botLayer: lambda.LayerVersion;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.layer = SharedResources.createSolanaLayer(this);
    this.botLayer = SharedResources.createBotLayer(this);
  }
}
