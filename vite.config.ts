// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv, type Plugin } from "vite";

// O preset do Lovable só injeta variáveis VITE_* (em import.meta.env). As server
// functions (ex.: src/lib/employees-fn.ts) precisam de SUPABASE_SERVICE_ROLE_KEY
// em process.env — este plugin copia as variáveis sem prefixo do .env para lá,
// apenas no processo Node de dev/build (nunca vai para o bundle do client).
function serverEnvFromDotenv(): Plugin {
  return {
    name: "server-env-from-dotenv",
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), "");
      for (const [key, value] of Object.entries(env)) {
        if (!key.startsWith("VITE_") && process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [serverEnvFromDotenv()],
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
