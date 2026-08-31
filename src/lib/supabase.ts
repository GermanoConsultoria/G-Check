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
