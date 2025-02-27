import {
  GetParameterCommand,
  PutParameterCommand,
  SSMClient,
} from "@aws-sdk/client-ssm";

export class TradeStateManager {
  private ssm: SSMClient;
  private parameterPath: string;

  constructor(parameterPath: string) {
    this.ssm = new SSMClient({});
    this.parameterPath = parameterPath;
  }

  async getState(): Promise<string> {
    try {
      const response = await this.ssm.send(
        new GetParameterCommand({
          Name: this.parameterPath,
        })
      );
      return response.Parameter?.Value || "NONE";
    } catch (error) {
      console.error("Error retrieving state:", error);
      throw new Error("Failed to retrieve state.");
    }
  }

  async updateState(state: string): Promise<void> {
    await this.ssm.send(
      new PutParameterCommand({
        Name: this.parameterPath,
        Value: state,
        Type: "String",
        Overwrite: true,
      })
    );
  }
}
