'use strict';

const js = require('@eslint/js');
const globals = require('globals');

const baseRules = {
  ...js.configs.recommended.rules,
  quotes: [
    'error',
    'single',
    { avoidEscape: true, allowTemplateLiterals: true }
  ],
  'no-multi-spaces': [
    'error',
    {
      exceptions: {
        VariableDeclarator: true,
        ImportDeclaration: true
      }
    }
  ],
  'wrap-iife': 'error',
  'wrap-regex': 'error',
  'yield-star-spacing': 'error',
  yoda: ['error', 'never']
};

module.exports = [
  {
    ignores: ['node_modules/**', 'coverage/**']
  },
  {
    files: ['**/*.js'],
    ignores: ['examples/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.node,
        ...globals.mocha
      }
    },
    rules: baseRules
  },
  {
    files: ['examples/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.node
      }
    },
    rules: {
      ...baseRules,
      'no-unused-vars': 'off',
      'no-undef': 'off'
    }
  }
];
