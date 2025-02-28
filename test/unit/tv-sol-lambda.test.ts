import { setTestEnvironment, clearTestEnvironment } from "../setup/jest.setup";
import { mockClient } from "aws-sdk-client-mock";
import {
  SSMClient,
  GetParameterCommand,
  PutParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { handler } from "../../target/lambda/soltv/index.js";

// Mock AWS clients
const ssmMock = mockClient(SSMClient);
const secretsMock = mockClient(SecretsManagerClient);

describe("Checking Environment Variables", () => {
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
});

describe("Checking AWS Environment", () => {
  beforeEach(() => {
    setTestEnvironment("development");
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
    expect(
      JSON.parse(response.body).message.includes("Failed to retrieve state")
    );
  });

  it("should update parameter store to SELL", async () => {
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
      body: '{ "model": "tbd","action": "SELL","from": "SOL", "to": "USDC", "time": "2h" }',
    };
    const response = await handler(event);

    // Verify that PutParameterCommand was called with the right arguments

    const putParameterCalls = ssmMock.commandCalls(PutParameterCommand);
    expect(putParameterCalls).toHaveLength(1); // Ensure it was called once
    expect(putParameterCalls[0].args[0].input).toEqual({
      Name: "/tv/sol/2h/trading-state",
      Value: "SELL",
      Type: "String",
      Overwrite: true,
    });
  });
});

describe("Checking Alert Validation", () => {
  beforeEach(() => {
    setTestEnvironment("development");
    ssmMock.reset();
    secretsMock.reset();
  });

  afterEach(() => {
    clearTestEnvironment();
  });

  it("should return 400 if body is not included in the event", async () => {
    const response = await handler({});
    expect(response.statusCode).toBe(400);
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
      body: '{ "model": "tbd","action": "BUY","from": "SOL", "to": "USDC" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Error: Invalid alert - Missing required fields"
    );
  });

  it("should return 400 because to is missing from event body", async () => {
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
      body: '{ "model": "tbd","action": "BUY","from": "SOL", "time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Error: Invalid alert - Missing required fields"
    );
  });

  it("should return 400 because from is missing from event body", async () => {
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
      body: '{ "model": "tbd","action": "BUY","to": "SOL", "time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Error: Invalid alert - Missing required fields"
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
      body: '{ "model": "tbd", "from": "SOL", "to": "SOL", "time": "2h" }',
    };
    const response = await handler(event);

    console.error("****************", JSON.parse(response.body).message);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Error: Invalid alert - Missing required fields"
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
      body: '{ "model": "tbd", "action": "BUY", "from": "BTC", "to": "USDC", "time": "5m" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Error: Timeframe is incorrect: Expect 2h, received 5m"
    );
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
      body: '{ "model": "tbd", "action": "BUY", "from": "BTC", "to": "USDC", "time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Error: Unsupported trade pair: BTC-USDC"
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
      body: '{ "action": "BUY", "from": "USDC", "to": "SOL", "time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Trade already executed for this action BUY"
    );
  });

  it("should return 500 as no token balance", async () => {
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
      body: '{ "action": "BUY", "from": "USDC", "to": "SOL", "time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(
      JSON.parse(response.body).message.includes("could not find account")
    );
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
      body: '{ "action": "BUY", "from": "USDC", "to": "SOL","time": "2h" }',
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
      body: '{ "action": "SELL", "from": "SOL", "to": "USDC", "time": "2h" }',
    };
    const response = await handler(event);

    //going to catch the getState failure
    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).message).toBeTruthy();
    expect(JSON.parse(response.body).message).toContain(
      "Insufficient SOL balance to trade."
    );
  });
});
