import { FlatCompat } from '@eslint/eslintrc';
import { defineConfig } from 'eslint/config';

const compat = new FlatCompat();

export default defineConfig([
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      'dist/**',
      'build/**',
      'coverage/**',
    ],
  },
]);
