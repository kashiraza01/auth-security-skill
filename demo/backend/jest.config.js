/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  // One in-memory MongoDB is spun up per test file (see src/__tests__/helpers/db.ts);
  // the first run downloads the mongod binary, so keep timeouts generous.
  testTimeout: 60000,
  clearMocks: true,
  verbose: true,
};
