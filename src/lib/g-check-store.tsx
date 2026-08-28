import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase, type ChecklistItemRow, type ChecklistRow } from "@/lib/supabase";
import { useAuth } from "@/lib/auth-store";

export type ItemStatus = "pendente" | "concluido";

export const turnos = ["Manhã", "Tarde", "Noite"] as const;
export type Turno = (typeof turnos)[number];

export interface ChecklistItem {
  id: string;
  titulo: string;
  detalhe?: string;
  status: ItemStatus;
  responsavel: string;
}

export interface Checklist {
  id: string;
  nome: string;
  setor: string;
  turno: string;
  horario: string;
  ativo: boolean;
  itens: ChecklistItem[];
}

export interface ItemInput {
  /** Presente apenas ao editar um item já existente; identifica o item a preservar (status incluso). */
  id?: string;
  titulo: string;
  detalhe?: string;
  responsavel: string;
}

export interface ChecklistInput {
  nome: string;
  setor: string;
  turno: string;
  horario: string;
  ativo: boolean;
  itens: ItemInput[];
}

/** Gera um id legível a partir do nome (usado como PK da checklist no Supabase). */
function slugify(texto: string) {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const QUERY_KEY = ["checklists"] as const;

type ChecklistWithItems = ChecklistRow & { checklist_items: ChecklistItemRow[] };

/**
 * Busca checklists + itens em uma única query (join implícito do Postgrest via
 * "checklist_items(*)"). Ordena checklists por horário e, dentro de cada uma,
 * os itens pela coluna "posicao" (ordem definida na criação/edição).
 */
async function fetchChecklists(): Promise<Checklist[]> {
  const { data, error } = await supabase
    .from("checklists")
    .select("*, checklist_items(*)")
    .order("horario", { ascending: true })
    .order("posicao", { referencedTable: "checklist_items", ascending: true })
    .returns<ChecklistWithItems[]>();

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    nome: row.nome,
    setor: row.setor,
    turno: row.turno,
    horario: row.horario.slice(0, 5),
    ativo: row.ativo,
    itens: row.checklist_items.map((it) => ({
      id: it.id,
      titulo: it.titulo,
      status: it.status as ItemStatus,
      responsavel: it.responsavel,
      ...(it.detalhe ? { detalhe: it.detalhe } : {}),
    })),
  }));
}

interface Ctx {
  checklists: Checklist[];
  isLoading: boolean;
  isError: boolean;
  toggleItem: (checklistId: string, itemId: string) => void;
  concluirTodos: (checklistId: string) => void;
  reabrir: (checklistId: string) => void;
  criarChecklist: (input: ChecklistInput) => void;
  editarChecklist: (checklistId: string, input: ChecklistInput) => void;
  excluirChecklist: (checklistId: string) => void;
}

const GCheckContext = React.createContext<Ctx | null>(null);

export function GCheckProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  // "enabled: !!session" evita chamar o Supabase (e estourar RLS) antes do login terminar.
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: fetchChecklists, enabled: !!session });

  const toggleItemMutation = useMutation({
    mutationFn: async ({ itemId, next }: { itemId: string; next: ItemStatus }) => {
      const { error } = await supabase
        .from("checklist_items")
        .update({ status: next })
        .eq("id", itemId);
      if (error) throw error;
    },
    onError: () => {
      toast.error("Não foi possível atualizar o item.");
      // Reverte a atualização otimista buscando o estado real do servidor.
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const toggleItem = React.useCallback(
    (checklistId: string, itemId: string) => {
      let next: ItemStatus = "concluido";
      // Atualização otimista: aplica a mudança no cache do React Query antes da
      // resposta do servidor, para o toque no checkbox parecer instantâneo.
      // "next" é capturado pelo closure para ser reaproveitado na mutation abaixo.
      queryClient.setQueryData<Checklist[]>(QUERY_KEY, (prev) =>
        (prev ?? []).map((c) =>
          c.id !== checklistId
            ? c
            : {
                ...c,
                itens: c.itens.map((i) => {
                  if (i.id !== itemId) return i;
                  next = i.status === "concluido" ? "pendente" : "concluido";
                  return { ...i, status: next };
                }),
              },
        ),
      );
      toggleItemMutation.mutate({ itemId, next });
    },
    [queryClient, toggleItemMutation],
  );

  const concluirTodosMutation = useMutation({
    mutationFn: async (checklistId: string) => {
      const { error } = await supabase
        .from("checklist_items")
        .update({ status: "concluido" })
        .eq("checklist_id", checklistId);
      if (error) throw error;
    },
    onError: () => {
      toast.error("Não foi possível concluir a rotina.");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const concluirTodos = React.useCallback(
    (checklistId: string) => {
      queryClient.setQueryData<Checklist[]>(QUERY_KEY, (prev) =>
        (prev ?? []).map((c) =>
          c.id !== checklistId
            ? c
            : { ...c, itens: c.itens.map((i) => ({ ...i, status: "concluido" as ItemStatus })) },
        ),
      );
      concluirTodosMutation.mutate(checklistId);
    },
    [queryClient, concluirTodosMutation],
  );

  const reabrirMutation = useMutation({
    mutationFn: async (checklistId: string) => {
      const { error } = await supabase
        .from("checklist_items")
        .update({ status: "pendente" })
        .eq("checklist_id", checklistId);
      if (error) throw error;
    },
    onError: () => {
      toast.error("Não foi possível reabrir a rotina.");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const reabrir = React.useCallback(
    (checklistId: string) => {
      queryClient.setQueryData<Checklist[]>(QUERY_KEY, (prev) =>
        (prev ?? []).map((c) =>
          c.id !== checklistId
            ? c
            : { ...c, itens: c.itens.map((i) => ({ ...i, status: "pendente" as ItemStatus })) },
        ),
      );
      reabrirMutation.mutate(checklistId);
    },
    [queryClient, reabrirMutation],
  );

  const criarChecklistMutation = useMutation({
    mutationFn: async (input: ChecklistInput) => {
      // Id da checklist é o slug do nome; se já existir (mesmo nome usado antes),
      // acrescenta um sufixo numérico até achar um id livre.
      const existentes = (queryClient.getQueryData<Checklist[]>(QUERY_KEY) ?? []).map((c) => c.id);
      const baseId = slugify(input.nome) || "checklist";
      let id = baseId;
      let sufixo = 2;
      while (existentes.includes(id)) id = `${baseId}-${sufixo++}`;

      const { error: checklistError } = await supabase.from("checklists").insert({
        id,
        nome: input.nome,
        setor: input.setor,
        turno: input.turno,
        horario: input.horario,
        ativo: input.ativo,
      });
      if (checklistError) throw checklistError;

      // Ids dos itens seguem "<id-da-checklist>-<posição>" — todo item nasce "pendente".
      const itensPayload = input.itens.map((it, index) => ({
        id: `${id}-${index + 1}`,
        checklist_id: id,
        titulo: it.titulo,
        detalhe: it.detalhe?.trim() || null,
        responsavel: it.responsavel,
        status: "pendente",
        posicao: index + 1,
      }));

      const { error: itensError } = await supabase.from("checklist_items").insert(itensPayload);
      if (itensError) {
        // Não há transação entre as duas tabelas, então se os itens falharem
        // desfazemos manualmente a checklist já inserida para não deixar lixo órfão.
        await supabase.from("checklists").delete().eq("id", id);
        throw itensError;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: () => toast.error("Não foi possível criar a checklist."),
  });

  const criarChecklist = React.useCallback(
    (input: ChecklistInput) => {
      criarChecklistMutation.mutate(input);
    },
    [criarChecklistMutation],
  );

  const editarChecklistMutation = useMutation({
    mutationFn: async ({ checklistId, input }: { checklistId: string; input: ChecklistInput }) => {
      const atual = (queryClient.getQueryData<Checklist[]>(QUERY_KEY) ?? []).find(
        (c) => c.id === checklistId,
      );
      const statusPorId = new Map((atual?.itens ?? []).map((i) => [i.id, i.status]));
      const idsUsados = new Set<string>();

      // Reconciliação de itens: o form manda "itemId" para itens que já existiam
      // (checklist-form-dialog.tsx) e nada para itens novos. Aqui reaproveitamos o
      // id original — e portanto o status ("concluido"/"pendente") — sempre que ele
      // ainda existe e não foi usado por outro item nesta mesma edição; caso
      // contrário (item novo, ou id duplicado/inválido) geramos um UUID novo, que
      // sempre nasce "pendente". Isso evita resetar o progresso já feito ao editar.
      const itensFinal = input.itens.map((it, index) => {
        let id = it.id && statusPorId.has(it.id) && !idsUsados.has(it.id) ? it.id : undefined;
        if (!id) id = crypto.randomUUID();
        idsUsados.add(id);

        return {
          id,
          checklist_id: checklistId,
          titulo: it.titulo,
          detalhe: it.detalhe?.trim() || null,
          responsavel: it.responsavel,
          status: statusPorId.get(id) ?? "pendente",
          posicao: index + 1,
        };
      });

      // Itens que existiam antes mas não estão mais na lista final são removidos.
      const idsFinal = new Set(itensFinal.map((i) => i.id));
      const idsRemover = (atual?.itens ?? []).map((i) => i.id).filter((id) => !idsFinal.has(id));

      const { error: checklistError } = await supabase
        .from("checklists")
        .update({
          nome: input.nome,
          setor: input.setor,
          turno: input.turno,
          horario: input.horario,
          ativo: input.ativo,
        })
        .eq("id", checklistId);
      if (checklistError) throw checklistError;

      if (idsRemover.length) {
        const { error: deleteError } = await supabase
          .from("checklist_items")
          .delete()
          .in("id", idsRemover);
        if (deleteError) throw deleteError;
      }

      const { error: upsertError } = await supabase.from("checklist_items").upsert(itensFinal);
      if (upsertError) throw upsertError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
    onError: () => toast.error("Não foi possível salvar as alterações."),
  });

  const editarChecklist = React.useCallback(
    (checklistId: string, input: ChecklistInput) => {
      editarChecklistMutation.mutate({ checklistId, input });
    },
    [editarChecklistMutation],
  );

  const excluirChecklistMutation = useMutation({
    mutationFn: async (checklistId: string) => {
      // checklist_items tem "on delete cascade" no checklist_id, então apagar a
      // checklist remove os itens junto — não precisa deletar itens à mão.
      const { error } = await supabase.from("checklists").delete().eq("id", checklistId);
      if (error) throw error;
    },
    onSuccess: () => toast.success("Checklist excluída."),
    onError: () => {
      toast.error("Não foi possível excluir a checklist.");
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const excluirChecklist = React.useCallback(
    (checklistId: string) => {
      // Remoção otimista: tira a checklist do cache antes da resposta do servidor.
      queryClient.setQueryData<Checklist[]>(QUERY_KEY, (prev) =>
        (prev ?? []).filter((c) => c.id !== checklistId),
      );
      excluirChecklistMutation.mutate(checklistId);
    },
    [queryClient, excluirChecklistMutation],
  );

  const value = React.useMemo(
    () => ({
      checklists: query.data ?? [],
      isLoading: query.isLoading,
      isError: query.isError,
      toggleItem,
      concluirTodos,
      reabrir,
      criarChecklist,
      editarChecklist,
      excluirChecklist,
    }),
    [
      query.data,
      query.isLoading,
      query.isError,
      toggleItem,
      concluirTodos,
      reabrir,
      criarChecklist,
      editarChecklist,
      excluirChecklist,
    ],
  );

  return <GCheckContext.Provider value={value}>{children}</GCheckContext.Provider>;
}

export function useGCheck() {
  const ctx = React.useContext(GCheckContext);
  if (!ctx) throw new Error("useGCheck deve ser usado dentro de GCheckProvider");
  return ctx;
}

/** Contagem de itens concluídos/pendentes e percentual — usado no dashboard e nas cards. */
export function progresso(c: Checklist) {
  const total = c.itens.length;
  const feitos = c.itens.filter((i) => i.status === "concluido").length;
  return {
    total,
    feitos,
    pendentes: total - feitos,
    pct: total ? Math.round((feitos / total) * 100) : 0,
  };
}

/**
 * Agregado de tarefas (itens de checklist) por uma chave — nome do responsável
 * ou nome do setor. Alimenta as tabelas do dashboard ("tarefas por funcionário"
 * / "por setor") e os contadores nas páginas de funcionários e setores.
 */
export interface AgregadoTarefas {
  chave: string;
  total: number;
  feitos: number;
  pendentes: number;
}

/** Percorre os itens das checklists ativas somando por chave. */
function agregaTarefas(
  checklists: Checklist[],
  chaveDoItem: (item: ChecklistItem, checklist: Checklist) => string,
): AgregadoTarefas[] {
  const mapa = new Map<string, AgregadoTarefas>();
  for (const c of checklists) {
    if (!c.ativo) continue;
    for (const i of c.itens) {
      const chave = chaveDoItem(i, c).trim();
      if (!chave) continue;
      const atual = mapa.get(chave) ?? { chave, total: 0, feitos: 0, pendentes: 0 };
      atual.total += 1;
      if (i.status === "concluido") atual.feitos += 1;
      else atual.pendentes += 1;
      mapa.set(chave, atual);
    }
  }
  // Mais pendências primeiro; empata por volume total e depois nome.
  return [...mapa.values()].sort(
    (a, b) => b.pendentes - a.pendentes || b.total - a.total || a.chave.localeCompare(b.chave),
  );
}

export function tarefasPorFuncionario(checklists: Checklist[]) {
  return agregaTarefas(checklists, (i) => i.responsavel);
}

export function tarefasPorSetor(checklists: Checklist[]) {
  return agregaTarefas(checklists, (_i, c) => c.setor);
}

/** Acha o agregado de uma chave (ignora caixa/espaços); devolve zerado se não houver. */
export function resumoDe(agregados: AgregadoTarefas[], chave: string): AgregadoTarefas {
  const alvo = chave.trim().toLowerCase();
  return (
    agregados.find((a) => a.chave.trim().toLowerCase() === alvo) ?? {
      chave,
      total: 0,
      feitos: 0,
      pendentes: 0,
    }
  );
}

export type ChecklistEstado = "concluido" | "em_andamento" | "pendente";

/** Deriva o estado da checklist a partir do progresso — não é um campo salvo no banco. */
export function estado(c: Checklist): ChecklistEstado {
  const { feitos, total } = progresso(c);
  if (total > 0 && feitos === total) return "concluido";
  if (feitos === 0) return "pendente";
  return "em_andamento";
}

export const estadoLabel: Record<ChecklistEstado, string> = {
  concluido: "Concluído",
  em_andamento: "Em andamento",
  pendente: "Não iniciado",
};

/** Compara o responsável do item com o nome de perfil informado (ignora caixa e espaços). */
export function ehResponsavel(item: ChecklistItem, nome?: string | null) {
  if (!nome) return false;
  return item.responsavel.trim().toLowerCase() === nome.trim().toLowerCase();
}
