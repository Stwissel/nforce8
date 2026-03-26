"use strict";

/**
 * Fallback for analyzers that use ESLint’s legacy config only (e.g. Codacy ESLint 8).
 * Canonical rules live in eslint.config.js (flat config, ESLint 9+).
 */
module.exports = {
  root: true,
  ignorePatterns: ["node_modules/**", "coverage/**", "examples/**"],
  env: {
    node: true,
    es2022: true,
    mocha: true,
  },
  extends: ["eslint:recommended"],
  rules: {
    quotes: [
      "error",
      "single",
      { avoidEscape: true, allowTemplateLiterals: true },
    ],
    "no-multi-spaces": [
      "error",
      {
        exceptions: {
          VariableDeclarator: true,
          ImportDeclaration: true,
        },
      },
    ],
    "wrap-iife": "error",
    "wrap-regex": "error",
    "yield-star-spacing": "error",
    yoda: ["error", "never"],
  },
};
