# TradingView Solana Webhook

The execution end of a TradingView model. TradingView will send an alert on buy/sell signals. This webhook will execute on the signals swap Solana for USDC and vice versa using Jupiter swap APIs.

Deployed onto an AWS serverless infrastructure. Right now there are a set of lambdas that handle various alerts and an API gateway. State is managed in parameter store. Might move of DynamoDB in the near future for extended functionality.

## Tests

### Unit Tests

Leverages mocks to test functionality. Unit tests live in `test/unit`.

```
npm run test
```

### Live Tests

> [!CAUTION]
> These tests, if properly configured, will execute live transactions against your assets.

Configuration of the live tests occurs in directory `test/live`. Copy `env.live.example` to `.env.live` and add appropriate info.

To run the live tests.

```
npm run test:live
```

### Run All Tests

```
npm run test:all
```

## CICD with CDK

### Customizing your environment

Edit the lib/config/.env to customize URLs and your IP. The IP is used to filter who can call your endpoint. Your IP plus TradingView's IPs.

```
PUBLIC_IP=YOUR_IP_HERE
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
JUPITER_API_URL=https://api.jup.ag
```

### Bootstrap

```
cdk bootstrap aws://{aws account}/{aws region} --qualifier {custom qualifier} --profile {aws profile}
```

### Synth

> [!IMPORTANT]
> Docker should be running.

```
cdk synth --profile {aws profile}
```

### Deploy

> [!IMPORTANT]
> Docker should be running.

```
cdk deploy --all --profile {aws profile}
```
