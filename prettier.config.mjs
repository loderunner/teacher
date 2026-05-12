/** @type {import('prettier').Config} */
const prettierConfig = {
  singleQuote: true,
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['twMerge', 'clsx', 'cn'],
  overrides: [
    {
      files: '**/*.md',
      options: {
        proseWrap: 'always',
      },
    },
  ],
};

export default prettierConfig;
