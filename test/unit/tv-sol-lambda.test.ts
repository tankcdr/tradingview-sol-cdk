import { setTestEnvironment, clearTestEnvironment } from "../setup/jest.setup";
import { mockClient } from "aws-sdk-client-mock";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { handler } from "../../src/lambda/soltv";

// Mock AWS clients
const ssmMock = mockClient(SSMClient);
const secretsMock = mockClient(SecretsManagerClient);

describe("Missing Environment Variables", () => {
  beforeEach(() => {
    setTestEnvironment("development");
    ssmMock.reset();
    secretsMock.reset();
  });

  it("should return 400 if trade state parameter is not defined", async () => {
    delete process.env.PARAMETER_TRADE_STATE;
    expect(process.env.PARAMETER_TRADE_STATE).toBeUndefined();

    const response = await handler({});
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
  });

  it("should return 400 if wallet pk is not defined", async () => {
    delete process.env.SECRET_WALLET_PK;
    expect(process.env.SECRET_WALLET_PK).toBeUndefined();

    const response = await handler({});
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
  });

  it("should return 400 if TIMEFRAME is not defined", async () => {
    delete process.env.TIMEFRAME;
    expect(process.env.TIMEFRAME).toBeUndefined();

    const response = await handler({});
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
  });

  it("should return 400 if body is not included in the event", async () => {
    const response = await handler({});
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
  });
});

describe("Trading Lambda Tests", () => {
  beforeEach(() => {
    setTestEnvironment("development");
    // Reset mocks before each test
    ssmMock.reset();
    secretsMock.reset();
  });

  afterEach(() => {
    clearTestEnvironment();
  });

  it("should return 500 because getState will fail", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString:
        "pmDwu33kYvaJhhEzkqGz7yrgsVgEi7c4QbAZXCzTEeTZ5uyZ5JRgiAmBeTLHP2UjE1DMKb7wAma9xeK6KNfZB4u",
    });

    const event = {
      body: {},
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toBeTruthy();
  });

  it("should return 400 because time is missing from event body", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString:
        "pmDwu33kYvaJhhEzkqGz7yrgsVgEi7c4QbAZXCzTEeTZ5uyZ5JRgiAmBeTLHP2UjE1DMKb7wAma9xeK6KNfZB4u",
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
      body: '{ "model": "tbd","action": "BUY","asset": "SOL" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Invalid alert: Missing required fields"
    );
  });

  it("should return 400 because asset is missing from event body", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString:
        "pmDwu33kYvaJhhEzkqGz7yrgsVgEi7c4QbAZXCzTEeTZ5uyZ5JRgiAmBeTLHP2UjE1DMKb7wAma9xeK6KNfZB4u",
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
      body: '{ "model": "tbd","action": "BUY","time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Invalid alert: Missing required fields"
    );
  });

  it("should return 400 because action is missing from event body", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString:
        "pmDwu33kYvaJhhEzkqGz7yrgsVgEi7c4QbAZXCzTEeTZ5uyZ5JRgiAmBeTLHP2UjE1DMKb7wAma9xeK6KNfZB4u",
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
      body: '{ "model": "tbd","asset": "SOL","time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Invalid alert: Missing required fields"
    );
  });

  it("should return 400 because there is a time mismatch", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString:
        "pmDwu33kYvaJhhEzkqGz7yrgsVgEi7c4QbAZXCzTEeTZ5uyZ5JRgiAmBeTLHP2UjE1DMKb7wAma9xeK6KNfZB4u",
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
      body: '{ "model": "tbd", "action": "BUY", "asset": "SOL","time": "5m" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Error: Timeframe is incorrect: Expect 2h, received 5m"
    );
  });

  it("should return 400 because there is an asset mismatch", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString:
        "pmDwu33kYvaJhhEzkqGz7yrgsVgEi7c4QbAZXCzTEeTZ5uyZ5JRgiAmBeTLHP2UjE1DMKb7wAma9xeK6KNfZB4u",
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
      body: '{ "model": "tbd", "action": "BUY", "asset": "BTC","time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Error: Unsupported asset - Only SOL is supported"
    );
  });

  it("should return 200 because there is no work to do", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString:
        "pmDwu33kYvaJhhEzkqGz7yrgsVgEi7c4QbAZXCzTEeTZ5uyZ5JRgiAmBeTLHP2UjE1DMKb7wAma9xeK6KNfZB4u",
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
      body: '{ "model": "tbd", "action": "BUY", "asset": "SOL","time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "No trade executed, state unchanged"
    );
  });

  it("should return 200 and exercise Jupiter API", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString:
        "pmDwu33kYvaJhhEzkqGz7yrgsVgEi7c4QbAZXCzTEeTZ5uyZ5JRgiAmBeTLHP2UjE1DMKb7wAma9xeK6KNfZB4u",
    });

    // validates this works
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: "/tv/sol/2h/trading-state",
        Type: "String",
        Value: "NONE", //prevents a trade
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

  it("should return 500 because this account doesn't have a tokenaccount", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString:
        "pmDwu33kYvaJhhEzkqGz7yrgsVgEi7c4QbAZXCzTEeTZ5uyZ5JRgiAmBeTLHP2UjE1DMKb7wAma9xeK6KNfZB4u",
    });

    // validates this works
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: "/tv/sol/2h/trading-state",
        Type: "String",
        Value: "SELL", //prevents a trade
      },
    });

    const event = {
      body: '{ "model": "tbd", "action": "BUY", "asset": "SOL","time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toBeTruthy();
  });

  it("should return 500 because this account doesn't have a tokenaccount", async () => {
    //encoded version of data/test-account.json
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString:
        "pmDwu33kYvaJhhEzkqGz7yrgsVgEi7c4QbAZXCzTEeTZ5uyZ5JRgiAmBeTLHP2UjE1DMKb7wAma9xeK6KNfZB4u",
    });

    // validates this works
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: {
        Name: "/tv/sol/2h/trading-state",
        Type: "String",
        Value: "BUY", //prevents a trade
      },
    });

    const event = {
      body: '{ "model": "tbd", "action": "SELL", "asset": "SOL","time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toBeTruthy();
  });
});
