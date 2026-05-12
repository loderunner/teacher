/** @type {import('prettier').Config} */
const prettierConfig = {
  singleQuote: true,
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
