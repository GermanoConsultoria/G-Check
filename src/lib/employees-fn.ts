import { createServerFn } from "@tanstack/react-start";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getServerEnvWithDiag } from "./server-env";

/**
 * Ponto crítico de segurança deste arquivo: criar/editar usuários exige a
 * SERVICE ROLE KEY do Supabase (bypassa RLS), que só existe no servidor
 * (via getServerEnv, nunca import.meta.env) e nunca é exposta ao client.
 *
 * Antes de liberar esse poder, revalidamos a permissão no servidor mesmo que
 * a UI já esconda os botões de quem não é admin — o accessToken do chamador
 * chega como parâmetro (não é lido de cookie/sessão do server) e é usado com
 * a ANON key para: 1) confirmar que o token é de um usuário autenticado de
 * verdade (auth.getUser) e 2) checar o role dele na tabela profiles. Só então
 * o client com a service role key é devolvido.
 */
async function getAdminClient(accessToken: string): Promise<SupabaseClient> {
  const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  const anonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;
  const { value: serviceRoleKey, diag } = await getServerEnvWithDiag("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    // Diagnóstico: aponta qual variável falta e o que cada fonte de env
    // enxerga (só contagens, nunca valores). Não expõe segredos.
    const faltando = [
      !supabaseUrl && "VITE_SUPABASE_URL",
      !anonKey && "VITE_SUPABASE_ANON_KEY",
      !serviceRoleKey && "SUPABASE_SERVICE_ROLE_KEY",
    ]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Configuração do Supabase ausente no servidor: ${faltando}. ` +
        `[process.env: ${diag.procEnv}] [request.cf.env: ${diag.cfReq}] ` +
        `[cloudflare:workers: ${diag.cfMod}]`,
    );
  }

  const supabaseAsCaller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: userData, error: userError } = await supabaseAsCaller.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Sessão inválida. Faça login novamente.");
  }

  const { data: perfil, error: perfilError } = await supabaseAsCaller
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (perfilError || perfil?.role !== "admin") {
    throw new Error("Apenas administradores podem gerenciar funcionários.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const criarInputSchema = z.object({
  accessToken: z.string().min(1),
  nome: z.string().trim().min(1),
  email: z.string().trim().email(),
  senha: z.string().min(6),
});

/** Server function: roda só no servidor (nunca é enviada ao bundle do client). */
export const criarFuncionario = createServerFn({ method: "POST" })
  .validator((data: unknown) => criarInputSchema.parse(data))
  .handler(async ({ data }) => {
    const supabaseAdmin = await getAdminClient(data.accessToken);

    const { data: novoUsuario, error: criarError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.senha,
      email_confirm: true,
      user_metadata: { nome: data.nome, role: "funcionario" },
    });

    if (criarError || !novoUsuario.user) {
      throw new Error(criarError?.message ?? "Não foi possível criar o funcionário.");
    }

    return { id: novoUsuario.user.id, nome: data.nome, email: data.email };
  });

const editarInputSchema = z.object({
  accessToken: z.string().min(1),
  userId: z.string().min(1),
  nome: z.string().trim().min(1),
  email: z.string().trim().email(),
  senha: z.union([z.string().min(6), z.literal("")]).optional(),
});

export const editarFuncionario = createServerFn({ method: "POST" })
  .validator((data: unknown) => editarInputSchema.parse(data))
  .handler(async ({ data }) => {
    const supabaseAdmin = await getAdminClient(data.accessToken);

    const authUpdate: {
      email: string;
      user_metadata: Record<string, unknown>;
      password?: string;
    } = {
      email: data.email,
      user_metadata: { nome: data.nome },
    };
    // Senha é opcional na edição: só troca se o admin preencheu um valor novo.
    if (data.senha) authUpdate.password = data.senha;

    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      authUpdate,
    );
    if (authError) {
      throw new Error(authError.message || "Não foi possível atualizar o funcionário.");
    }

    const { error: perfilError } = await supabaseAdmin
      .from("profiles")
      .update({ nome: data.nome, email: data.email })
      .eq("id", data.userId);
    if (perfilError) {
      throw new Error(perfilError.message || "Não foi possível atualizar o perfil.");
    }

    return { id: data.userId, nome: data.nome, email: data.email };
  });
