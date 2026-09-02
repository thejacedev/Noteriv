import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  { ignores: [".next/**", "out/**", "src-tauri/target/**", "public/pdf*.mjs"] },
  ...nextVitals,
  ...nextTypescript,
];

export default eslintConfig;
