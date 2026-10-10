import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [...compat.extends('next/core-web-vitals', 'next/typescript'), { rules: { '@typescript-eslint/no-explicit-any': 'off', '@next/next/no-html-link-for-pages': 'off' } }];
export default config;
