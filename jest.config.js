const { pathsToModuleNameMapper } = require("ts-jest");
const {
  compilerOptions: { paths },
} = require("./tsconfig.json");

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  setupFilesAfterEnv: ["<rootDir>/test/setup/jest.setup.ts"], // Corrected path
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json", "node"],
  testPathIgnorePatterns: ["/node_modules/", "/live/"],
  moduleNameMapper: pathsToModuleNameMapper(paths, {
    prefix: "<rootDir>/",
  }),
};
