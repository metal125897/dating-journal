import { defineConfig, globalIgnores } from "eslint/config";
import ts from "typescript-eslint";
export default defineConfig([...ts.configs.recommended,globalIgnores(["build/**",".npm-cache/**","node_modules/**"])]);
