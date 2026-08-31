import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env["VITE_SUPABASE_URL"];
const supabaseAnonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"];

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY precisam estar definidas (arquivo .env).",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface ChecklistRow {
  id: string;
  nome: string;
  setor: string;
  turno: string;
  horario: string;
  ativo: boolean;
  dias_semana: number[];
}

export interface ChecklistItemRow {
  id: string;
  checklist_id: string;
  titulo: string;
  detalhe: string | null;
  responsavel: string;
  status: string;
  posicao: number;
}

export interface SetorRow {
  id: string;
  nome: string;
  descricao: string | null;
}

export interface DiaDesativadoRow {
  /** ISO "yyyy-MM-dd" (tipo date do Postgres). */
  data: string;
  criado_por: string | null;
  created_at: string;
}

/** Snapshot de uma checklist num dia — gravado no rollover diário. */
export interface ChecklistExecucaoRow {
  id: string;
  checklist_id: string;
  /** ISO "yyyy-MM-dd". */
  data: string;
  nome: string;
  setor: string;
  turno: string;
  /** "HH:MM:SS". */
  horario: string;
  total_itens: number;
  itens_concluidos: number;
  completa: boolean;
  itens: { titulo: string; responsavel: string; status: string }[];
  registrado_em: string;
}
