import * as dotenv from "dotenv";
import path = require("path");
import { z } from "zod";

// Update path to look in test/live directory
const envPath = path.resolve(__dirname, "../live/.env.live");

// Load .env.live file
dotenv.config({ path: envPath });

const liveEnvSchema = z.object({
  LIVE_TEST_WALLET_PK: z.string().min(44),
});

export const validateLiveTestEnv = () => {
  const result = liveEnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error("❌ Missing required live test environment variables");
    console.error("Please create a .env.live file based on .env.live.example");
    process.exit(1);
  }
  return result.data;
};
