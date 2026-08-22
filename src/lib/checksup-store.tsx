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
  itens: ItemInput[];
}

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
}

const ChecksupContext = React.createContext<Ctx | null>(null);

export function ChecksupProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { session } = useAuth();
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
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });

  const toggleItem = React.useCallback(
    (checklistId: string, itemId: string) => {
      let next: ItemStatus = "concluido";
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
      });
      if (checklistError) throw checklistError;

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

      const idsFinal = new Set(itensFinal.map((i) => i.id));
      const idsRemover = (atual?.itens ?? []).map((i) => i.id).filter((id) => !idsFinal.has(id));

      const { error: checklistError } = await supabase
        .from("checklists")
        .update({
          nome: input.nome,
          setor: input.setor,
          turno: input.turno,
          horario: input.horario,
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
    ],
  );

  return <ChecksupContext.Provider value={value}>{children}</ChecksupContext.Provider>;
}

export function useChecksup() {
  const ctx = React.useContext(ChecksupContext);
  if (!ctx) throw new Error("useChecksup deve ser usado dentro de ChecksupProvider");
  return ctx;
}

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

export type ChecklistEstado = "concluido" | "em_andamento" | "pendente";

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
