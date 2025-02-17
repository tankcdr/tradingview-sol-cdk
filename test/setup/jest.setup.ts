import { mockEnv } from "./test-env";

// Helper to set environment variables
export const setTestEnvironment = (environment: keyof typeof mockEnv) => {
  const envVars = mockEnv[environment];
  Object.entries(envVars).forEach(([key, value]) => {
    process.env[key] = value;
  });
};

// Helper to clear environment variables
export const clearTestEnvironment = () => {
  Object.keys(mockEnv.development).forEach((key) => {
    delete process.env[key];
  });
};
