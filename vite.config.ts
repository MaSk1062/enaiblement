import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // Server-side modules read process.env. Vite exposes only VITE_* to the client and does
  // not populate process.env at all, so in local dev GCP_PROJECT_ID and the model ids would
  // be missing and every Firestore/Gemini call would fail. On Cloud Run the platform sets
  // these directly, and there is no .env file - so real env always wins over the file.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    process.env[key] ??= value;
  }

  return {
    plugins: [tailwindcss(), reactRouter()],
    resolve: {
      tsconfigPaths: true,
    },
  };
});
