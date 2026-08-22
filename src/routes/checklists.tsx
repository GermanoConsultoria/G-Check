import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Check, ChevronDown, Clock, RotateCcw, User } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EditarChecklistDialog, NovaChecklistDialog } from "@/components/checklist-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import {
  estado,
  estadoLabel,
  progresso,
  turnos,
  useChecksup,
  type Checklist,
} from "@/lib/checksup-store";

export const Route = createFileRoute("/checklists")({
  head: () => ({
    meta: [
      { title: "Checklists de rotina — Checksup" },
      {
        name: "description",
        content:
          "Abra e conclua rotinas de supermercado: abertura, reposição de gôndolas, validade, limpeza e fechamento.",
      },
      { property: "og:title", content: "Checklists de rotina — Checksup" },
      {
        property: "og:description",
        content: "Acompanhe item por item as rotinas operacionais da sua loja.",
      },
    ],
  }),
  component: ChecklistsPage,
});

const filtros = [
  { id: "todos", label: "Todos" },
  { id: "pendente", label: "Não iniciados" },
  { id: "em_andamento", label: "Em andamento" },
  { id: "concluido", label: "Concluídos" },
] as const;

const filtrosTurno = [
  { id: "todos", label: "Todos os turnos" },
  ...turnos.map((t) => ({ id: t, label: t })),
] as const;

function EstadoBadge({ c }: { c: Checklist }) {
  const e = estado(c);
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium",
        e === "concluido" && "bg-primary/12 text-primary",
        e === "em_andamento" && "bg-chart-4/20 text-chart-4",
        e === "pendente" && "bg-muted text-muted-foreground",
      )}
    >
      {estadoLabel[e]}
    </Badge>
  );
}

function ChecklistCard({ c }: { c: Checklist }) {
  const { toggleItem, concluirTodos, reabrir } = useChecksup();
  const { isAdmin } = useAuth();
  const [aberto, setAberto] = React.useState(false);
  const p = progresso(c);

  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start gap-2 p-5">
        <button
          onClick={() => setAberto((v) => !v)}
          className="flex min-w-0 flex-1 flex-col gap-4 text-left"
          aria-expanded={aberto}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight">{c.nome}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{c.setor}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" /> {c.turno} · {c.horario}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <EstadoBadge c={c} />
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform",
                  aberto && "rotate-180",
                )}
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {p.feitos} de {p.total} itens concluídos
              </span>
              <span className="font-medium text-foreground">{p.pct}%</span>
            </div>
            <Progress value={p.pct} className="h-1.5" />
          </div>
        </button>
        {isAdmin && <EditarChecklistDialog checklist={c} />}
      </div>

      {aberto && (
        <div className="border-t border-border p-5 pt-4">
          <ul className="divide-y divide-border">
            {c.itens.map((i) => {
              const feito = i.status === "concluido";
              return (
                <li key={i.id} className="flex items-start gap-3 py-3">
                  <button
                    onClick={() => toggleItem(c.id, i.id)}
                    aria-label={feito ? `Reabrir ${i.titulo}` : `Concluir ${i.titulo}`}
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                      feito
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input hover:border-primary",
                    )}
                  >
                    {feito && <Check className="size-3.5" />}
                  </button>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        feito && "text-muted-foreground line-through",
                      )}
                    >
                      {i.titulo}
                    </p>
                    {i.detalhe && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{i.detalhe}</p>
                    )}
                    <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <User className="size-3" /> {i.responsavel}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => concluirTodos(c.id)} disabled={p.pendentes === 0}>
              <Check className="size-4" /> Concluir rotina
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => reabrir(c.id)}
              disabled={p.feitos === 0}
            >
              <RotateCcw className="size-4" /> Reabrir
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ChecklistsPage() {
  const { checklists, isLoading, isError } = useChecksup();
  const { isAdmin } = useAuth();
  const [filtro, setFiltro] = React.useState<(typeof filtros)[number]["id"]>("todos");
  const [filtroTurno, setFiltroTurno] =
    React.useState<(typeof filtrosTurno)[number]["id"]>("todos");

  if (isLoading) {
    return (
      <AppShell title="Checklists" subtitle="Rotinas operacionais da Loja Centro">
        <p className="text-sm text-muted-foreground">Carregando rotinas…</p>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell title="Checklists" subtitle="Rotinas operacionais da Loja Centro">
        <p className="text-sm text-destructive">Não foi possível carregar as rotinas.</p>
      </AppShell>
    );
  }

  const lista = checklists.filter(
    (c) =>
      (filtro === "todos" || estado(c) === filtro) &&
      (filtroTurno === "todos" || c.turno === filtroTurno),
  );

  return (
    <AppShell title="Checklists" subtitle="Rotinas operacionais da Loja Centro">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {filtros.map((f) => (
              <button
                key={f.id}
                onClick={() => setFiltro(f.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                  filtro === f.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {isAdmin && <NovaChecklistDialog />}
        </div>

        <div className="flex flex-wrap gap-2">
          {filtrosTurno.map((f) => (
            <button
              key={f.id}
              onClick={() => setFiltroTurno(f.id)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                filtroTurno === f.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {lista.map((c) => (
            <ChecklistCard key={c.id} c={c} />
          ))}
          {lista.length === 0 && (
            <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhuma rotina neste estado.
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
