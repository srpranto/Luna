interface PostcssConfig {
  plugins: Record<string, Record<string, unknown>>;
}

const config: PostcssConfig = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
