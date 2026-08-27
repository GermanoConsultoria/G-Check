import { getRequest } from "@tanstack/react-start/server";

/**
 * Lê uma variável de ambiente do servidor de forma portátil entre runtimes.
 *
 * - Local (`vite dev` / `vite build`): o plugin `serverEnvFromDotenv` do
 *   vite.config.ts copia o `.env` para `process.env`, então a leitura direta
 *   resolve.
 * - Cloudflare Workers (produção): `process.env` fica vazio (a menos que
 *   `nodejs_compat` + `compatibility_date` recente estejam ativos). As
 *   secrets/vars chegam no contexto de runtime do request — no srvx/Nitro v3
 *   isso é `request.runtime.cloudflare.env` — ou pelo módulo virtual
 *   `cloudflare:workers`.
 *
 * Nunca expõe valores: só devolve a string pedida.
 */
export async function getServerEnv(key: string): Promise<string | undefined> {
  return (await getServerEnvWithDiag(key)).value;
}

interface ServerEnvDiag {
  /** Nº de chaves em process.env e se a procurada está lá. */
  procEnv: string;
  /** getRequest().runtime.cloudflare.env: alcançável? nº de chaves? tem a chave? */
  cfReq: string;
  /** import("cloudflare:workers").env: alcançável? nº de chaves? tem a chave? */
  cfMod: string;
}

/**
 * Igual a getServerEnv, mas também devolve um diagnóstico (só contagens e
 * presença/ausência da chave — nunca valores) para descobrir onde a variável
 * deveria estar e não está.
 */
export async function getServerEnvWithDiag(
  key: string,
): Promise<{ value: string | undefined; diag: ServerEnvDiag }> {
  const diag: ServerEnvDiag = { procEnv: "n/a", cfReq: "n/a", cfMod: "n/a" };
  let value: string | undefined;

  // 1) process.env
  try {
    const env = typeof process !== "undefined" ? process.env : undefined;
    if (env) {
      diag.procEnv = `${Object.keys(env).length} chaves, tem=${Boolean(env[key])}`;
      if (env[key]) value = env[key];
    } else {
      diag.procEnv = "process.env indisponível";
    }
  } catch (e) {
    diag.procEnv = `erro: ${(e as Error).message}`;
  }

  // 2) Contexto de runtime do request (Cloudflare via srvx / Nitro v3)
  try {
    const req = getRequest() as Request & {
      runtime?: { cloudflare?: { env?: Record<string, unknown> } };
    };
    const cfEnv = req?.runtime?.cloudflare?.env;
    if (cfEnv) {
      diag.cfReq = `${Object.keys(cfEnv).length} chaves, tem=${Boolean(cfEnv[key])}`;
      const v = cfEnv[key];
      if (!value && typeof v === "string" && v) value = v;
    } else {
      diag.cfReq = `sem runtime.cloudflare.env (runtime=${Boolean(req?.runtime)})`;
    }
  } catch (e) {
    diag.cfReq = `erro: ${(e as Error).message}`;
  }

  // 3) Módulo virtual do Cloudflare Workers (externalizado no build da CF).
  // Especificador computado de propósito: evita que TS/Vite tentem resolver
  // "cloudflare:workers" fora do runtime da Cloudflare.
  try {
    const specifier = ["cloudflare", "workers"].join(":");
    const mod = (await import(/* @vite-ignore */ specifier)) as {
      env?: Record<string, unknown>;
    };
    const cfEnv = mod?.env;
    if (cfEnv) {
      diag.cfMod = `${Object.keys(cfEnv).length} chaves, tem=${Boolean(cfEnv[key])}`;
      const v = cfEnv[key];
      if (!value && typeof v === "string" && v) value = v;
    } else {
      diag.cfMod = "módulo sem .env";
    }
  } catch (e) {
    diag.cfMod = `indisponível: ${(e as Error).message}`;
  }

  return { value, diag };
}
