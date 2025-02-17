import * as dotenv from "dotenv";
import path = require("path");
import { z } from "zod";

// Load environment variables with explicit path
dotenv.config({ path: path.resolve(__dirname, ".env") });

// Define environment schema
const envSchema = z.object({
  PUBLIC_IP: z.string().cidr(),
  SOLANA_RPC_URL: z.string().url(),
  JUPITER_API_URL: z.string().url(),
});

// Parse and validate environment variables
const parseEnv = () => {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error("❌ Invalid environment variables:", parsed.error.format());
    throw new Error("Invalid environment variables");
  }

  return parsed.data;
};

export const customEnv = parseEnv();
