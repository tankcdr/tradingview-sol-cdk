import { mockClient } from "aws-sdk-client-mock";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { handler } from "../../src/lambda/soltv";
import {
  clearTestEnvironment,
  setTestEnvironment,
} from "../setup/live-test.setup";

// Mock AWS clients
const ssmMock = mockClient(SSMClient);
const secretsMock = mockClient(SecretsManagerClient);

describe("Live Trading Tests", () => {
  beforeAll(() => {
    // Skip these tests if running in CI
    if (process.env.CI) {
      console.log("Skipping live tests in CI environment");
      return;
    }
  });

  beforeEach(() => {
    setTestEnvironment("development");
    console.log(
      "after test environment SOLANA_RPC_URL:",
      process.env.SOLANA_RPC_URL
    );
  });

  afterEach(() => {
    clearTestEnvironment();
  });

  it("should execute a trade from SOL to USDC", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString: process.env.LIVE_TEST_WALLET_PK,
    });

    // validates this works
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: "/tv/sol/2h/trading-state",
        Type: "String",
        Value: "BUY",
      },
    });

    const event = {
      body: '{ "model": "tbd", "action": "SELL", "from": "SOL", "to": "USDC", "time": "2h" }',
    };
    const response = await handler(event);

    console.error(JSON.parse(response.body).message);
    //going to catch the getState failure
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBeTruthy();
    console.error(JSON.parse(response.body).message);
  }, 180_000);

  it("should execute a trade from USDC to SOL", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString: process.env.LIVE_TEST_WALLET_PK,
    });

    // validates this works
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: "/tv/sol/2h/trading-state",
        Type: "String",
        Value: "SELL",
      },
    });

    const event = {
      body: '{ "model": "tbd", "action": "BUY", "from": "USDC", "to": "SOL", "time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBeTruthy();
  }, 180_000);
});
