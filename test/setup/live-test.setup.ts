import * as dotenv from "dotenv";
import path = require("path");
import { z } from "zod";
import { mockEnv } from "./test-env";

// Path to .env.live
const envPath = path.resolve(__dirname, "../live/.env.live");

// Load .env.live file first to set initial process.env values
const dotenvResult = dotenv.config({ path: envPath });
if (dotenvResult.error) {
  console.warn(`⚠️ Could not load .env.live: ${dotenvResult.error.message}`);
}

// Define the type for environment variables from mockEnv
type EnvVars = typeof mockEnv.development;
type EnvKey = keyof EnvVars;

// Schema for required live environment variables
const liveEnvSchema = z.object({
  LIVE_TEST_WALLET_PK: z.string().min(44),
});

// Store original environment variables
const originalEnv: Partial<Record<string, string | undefined>> = {};

// Helper to set environment variables
export const setTestEnvironment = (environment: keyof typeof mockEnv) => {
  console.log("existing SOLANA_RPC_URL:", process.env.SOLANA_RPC_URL);
  // Save current environment state
  (Object.keys(mockEnv.development) as EnvKey[]).forEach((key) => {
    originalEnv[key] = process.env[key];
  });

  // Get the base mock environment
  const baseEnvVars = mockEnv[environment];

  // Set mockEnv variables only if they don't already exist in process.env
  (Object.keys(baseEnvVars) as EnvKey[]).forEach((key) => {
    if (process.env[key] === undefined) {
      process.env[key] = baseEnvVars[key];
    }
  });

  // Validate the merged environment
  const validationResult = liveEnvSchema.safeParse(process.env);
  if (!validationResult.success) {
    console.error("❌ Missing required live test environment variables");
    console.error("Please create a .env.live file based on .env.live.example");
    process.exit(1);
  }

  // Return function to restore original environment
  return () => {
    Object.keys(originalEnv).forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  };
};

// Helper to clear environment variables
export const clearTestEnvironment = () => {
  (Object.keys(mockEnv.development) as EnvKey[]).forEach((key) => {
    delete process.env[key];
  });
};
