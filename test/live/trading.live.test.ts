import { validateLiveTestEnv } from "../setup/live-test.setup";
import { mockClient } from "aws-sdk-client-mock";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { handler } from "../../src/lambda/SolTradingView";
import { clearTestEnvironment, setTestEnvironment } from "../setup/jest.setup";

// Mock AWS clients
const ssmMock = mockClient(SSMClient);
const secretsMock = mockClient(SecretsManagerClient);

describe("Live Trading Tests", () => {
  let liveEnv: ReturnType<typeof validateLiveTestEnv>;

  beforeAll(() => {
    // Skip these tests if running in CI
    if (process.env.CI) {
      console.log("Skipping live tests in CI environment");
      return;
    }
    liveEnv = validateLiveTestEnv();
  });

  beforeEach(() => {
    setTestEnvironment("development");
    // Skip if no live env
    if (!liveEnv) {
      console.log("Skipping: No live test environment");
      return;
    }
  });

  afterEach(() => {
    clearTestEnvironment();
  });

  it("should execute a trade from SOL to USDC", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString: liveEnv.LIVE_TEST_WALLET_PK,
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
      body: '{ "model": "tbd", "action": "SELL", "asset": "SOL","time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBeTruthy();
  });

  it("should execute a trade from USDC to SOL", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString: liveEnv.LIVE_TEST_WALLET_PK,
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
      body: '{ "model": "tbd", "action": "BUY", "asset": "SOL","time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBeTruthy();
  });
});
