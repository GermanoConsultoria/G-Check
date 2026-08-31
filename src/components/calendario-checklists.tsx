import * as React from "react";
import { ArrowLeft, CalendarDays, Clock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { dataDoIso, isoDoDia } from "@/lib/utils";
import type { Checklist } from "@/lib/g-check-store";

const fmtLongo = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "long",
});

/**
 * Rotinas ativas que caem no dia da semana desta data, ordenadas por horário.
 * As tarefas não têm data própria — o agendamento vive em checklist.diasSemana —
 * então "dia com tarefas" = existe rotina ativa para aquele dia da semana.
 */
function rotinasDoDia(checklists: Checklist[], date: Date): Checklist[] {
  const dow = date.getDay();
  return checklists
    .filter((c) => c.ativo && c.diasSemana.includes(dow))
    .sort((a, b) => a.horario.localeCompare(b.horario));
}

/**
 * Tela de calendário da página /checklists (renderiza no <main>, mantendo header
 * e sidebar). Marca os dias que têm rotinas agendadas, mostra as rotinas do dia
 * selecionado e leva para a lista já filtrada por aquele dia.
 */
export function CalendarioChecklists({
  checklists,
  diaInicial,
  onVoltar,
  onAbrirDia,
}: {
  checklists: Checklist[];
  diaInicial: string | undefined;
  onVoltar: () => void;
  onAbrirDia: (iso: string) => void;
}) {
  const hoje = React.useMemo(() => new Date(), []);
  const [selecionado, setSelecionado] = React.useState<Date>(
    diaInicial ? dataDoIso(diaInicial) : hoje,
  );

  const rotinas = rotinasDoDia(checklists, selecionado);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button variant="ghost" size="sm" className="gap-2" onClick={onVoltar}>
        <ArrowLeft className="size-4" />
        Voltar para a lista
      </Button>

      <div className="grid gap-5 md:grid-cols-[auto_1fr]">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
          <Calendar
            mode="single"
            selected={selecionado}
            defaultMonth={selecionado}
            onSelect={(date) => date && setSelecionado(date)}
            showOutsideDays
            className="[--cell-size:2.6rem]"
            modifiers={{ temTarefas: (date) => rotinasDoDia(checklists, date).length > 0 }}
            modifiersClassNames={{
              temTarefas:
                "after:pointer-events-none after:absolute after:bottom-1.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-primary aria-selected:after:bg-primary-foreground",
            }}
          />
          <div className="mt-2 flex items-center gap-1.5 border-t border-border px-1 pt-3 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary" />
            Dias com rotinas agendadas
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <p className="text-sm font-semibold capitalize">{fmtLongo.format(selecionado)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rotinas.length === 0
              ? "Nenhuma rotina neste dia"
              : `${rotinas.length} ${rotinas.length === 1 ? "rotina" : "rotinas"}`}
          </p>

          {rotinas.length > 0 && (
            <ul className="mt-4 space-y-2">
              {rotinas.map((c) => (
                <li key={c.id} className="rounded-xl border border-border px-3 py-2.5 text-sm">
                  <p className="font-medium">{c.nome}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>{c.setor}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" /> {c.turno} · {c.horario}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}

          <Button
            className="mt-5 w-full gap-2"
            disabled={rotinas.length === 0}
            onClick={() => onAbrirDia(isoDoDia(selecionado))}
          >
            <CalendarDays className="size-4" />
            Ver tarefas deste dia
          </Button>
        </div>
      </div>
    </div>
  );
}
