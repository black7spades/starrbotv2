module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    project: "./tsconfig.json"
  },
  plugins: ["@typescript-eslint"],
  // NOTE: the `*-type-checked` presets are the eventual goal, but several of
  // their rules hard-error while `strictNullChecks` is off in tsconfig.json.
  // Turn those presets back on once the codebase compiles under `strict: true`.
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        // `const { passwordHash, ...rest } = user` is the idiom used to strip
        // secrets before returning a record — don't flag the omitted key.
        ignoreRestSiblings: true
      }
    ],
    // Type-aware rules worth keeping even without the full preset: these catch
    // real bugs (unawaited promises) rather than style.
    "@typescript-eslint/no-floating-promises": "warn",
    "@typescript-eslint/no-misused-promises": "warn",
    // `any` is pervasive in this codebase today; warn so new uses are visible
    // without failing the build on existing ones.
    "@typescript-eslint/no-explicit-any": "warn",
    // Best-effort disk reads/Discord cleanup intentionally swallow failures.
    "no-empty": ["error", { allowEmptyCatch: true }]
  }
};
