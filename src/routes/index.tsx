import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  ListChecks,
  TrendingUp,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import type { ChecklistSearch } from "@/routes/checklists";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import {
  ehResponsavel,
  estado,
  estadoLabel,
  progresso,
  tarefasPorFuncionario,
  tarefasPorSetor,
  useGCheck,
  type AgregadoTarefas,
  type Checklist,
} from "@/lib/g-check-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "G-check — Dashboard de rotinas do supermercado" },
      {
        name: "description",
        content:
          "Visão rápida de pendências, checklists concluídos e taxa de execução das rotinas da sua loja.",
      },
      { property: "og:title", content: "G-check — Dashboard de rotinas do supermercado" },
      {
        property: "og:description",
        content: "Acompanhe pendências, conclusões e taxa de execução em tempo real.",
      },
    ],
  }),
  component: Dashboard,
});

function Metric({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  search,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Clock;
  tone: "primary" | "warn" | "neutral";
  /** Se informado, o card vira um link para /checklists já com esse filtro. */
  search?: ChecklistSearch | undefined;
}) {
  const base = "rounded-2xl border border-border bg-card p-5 shadow-sm";
  const conteudo = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{label}</p>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl",
            tone === "primary" && "bg-primary/12 text-primary",
            tone === "warn" && "bg-chart-4/20 text-chart-4",
            tone === "neutral" && "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4.5" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </>
  );

  if (search) {
    return (
      <Link
        to="/checklists"
        search={search}
        className={cn(base, "block transition-colors hover:border-primary/40 hover:bg-primary/5")}
      >
        {conteudo}
      </Link>
    );
  }

  return <div className={base}>{conteudo}</div>;
}

/**
 * Tabela-gráfico: uma linha por funcionário/setor com barra empilhada
 * (concluídos + pendentes) normalizada pelo maior volume da lista, para o
 * comprimento também comunicar carga de trabalho. Ordenada por pendências.
 */
function TarefasBreakdown({
  titulo,
  descricao,
  icon: Icon,
  dados,
  vazio,
  rotuloItem,
}: {
  titulo: string;
  descricao: string;
  icon: typeof Users;
  dados: AgregadoTarefas[];
  vazio: string;
  /** singular do que cada tarefa representa, p/ concordância ("tarefa"/"tarefas"). */
  rotuloItem: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {dados.map((d) => (
          <li key={d.chave} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium">{d.chave}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {d.pendentes > 0 ? (
                  <span className="font-medium text-chart-4">
                    {d.pendentes} pendente{d.pendentes > 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="font-medium text-primary">em dia</span>
                )}{" "}
                · {d.total} {d.total === 1 ? rotuloItem : `${rotuloItem}s`}
              </span>
            </div>
            {/* Barra 100% preenchida: cada linha se divide entre concluídas e
                pendentes pela SUA própria contagem, sem comparar com as outras. */}
            <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="bg-primary"
                style={{ width: `${d.total ? (d.feitos / d.total) * 100 : 0}%` }}
              />
              <div
                className="bg-chart-4"
                style={{ width: `${d.total ? (d.pendentes / d.total) * 100 : 0}%` }}
              />
            </div>
          </li>
        ))}
        {dados.length === 0 && (
          <li className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">{vazio}</li>
        )}
      </ul>
    </section>
  );
}

function Dashboard() {
  const { checklists, isLoading, isError } = useGCheck();
  const { isAdmin, profile } = useAuth();

  const subtitle = isAdmin
    ? "Resumo do dia — Loja Centro"
    : `Tarefas atribuídas a ${profile?.nome ?? "você"}`;

  if (isLoading) {
    return (
      <AppShell title="Dashboard" subtitle={subtitle}>
        <p className="text-sm text-muted-foreground">Carregando rotinas…</p>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell title="Dashboard" subtitle={subtitle}>
        <p className="text-sm text-destructive">Não foi possível carregar as rotinas.</p>
      </AppShell>
    );
  }

  const ativas = checklists.filter((c) => c.ativo);
  const inativas = checklists.length - ativas.length;
  // Admin vê todas as checklists ativas por inteiro. Funcionário vê versões
  // "recortadas": cada checklist mostra só os itens atribuídos a ele, e a
  // checklist inteira some se nenhum item dela for dele (evita "cascas vazias").
  const visiveis: Checklist[] = isAdmin
    ? ativas
    : ativas
        .map((c) => ({ ...c, itens: c.itens.filter((i) => ehResponsavel(i, profile?.nome)) }))
        .filter((c) => c.itens.length > 0);

  const totais = visiveis.reduce(
    (acc, c) => {
      const p = progresso(c);
      acc.itens += p.total;
      acc.feitos += p.feitos;
      acc.pendentes += p.pendentes;
      if (estado(c) === "concluido") acc.rotinasConcluidas += 1;
      return acc;
    },
    { itens: 0, feitos: 0, pendentes: 0, rotinasConcluidas: 0 },
  );

  const taxa = totais.itens ? Math.round((totais.feitos / totais.itens) * 100) : 0;
  const pendencias = visiveis
    .flatMap((c) => c.itens.filter((i) => i.status === "pendente").map((i) => ({ c, i })))
    .slice(0, 6);

  // Distribuição das tarefas (itens) por responsável e por setor — só faz
  // sentido para o admin, que enxerga todas as checklists ativas.
  const porFuncionario = isAdmin ? tarefasPorFuncionario(checklists) : [];
  const porSetor = isAdmin ? tarefasPorSetor(checklists) : [];

  return (
    <AppShell title="Dashboard" subtitle={subtitle}>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Pendências"
            value={String(totais.pendentes)}
            hint="itens aguardando execução"
            icon={AlertCircle}
            tone="warn"
            search={{ estados: ["pendente", "em_andamento"] }}
          />
          <Metric
            label="Checklists concluídos"
            value={`${totais.rotinasConcluidas}/${visiveis.length}`}
            hint="rotinas finalizadas hoje"
            icon={CheckCircle2}
            tone="primary"
            search={{ estados: ["concluido"] }}
          />
          <Metric
            label="Taxa de execução"
            value={`${taxa}%`}
            hint={`${totais.feitos} de ${totais.itens} itens`}
            icon={TrendingUp}
            tone="primary"
          />
          <Metric
            label="Rotinas ativas"
            value={String(visiveis.length)}
            hint={
              isAdmin && inativas > 0
                ? `${inativas} rotina${inativas > 1 ? "s" : ""} inativa${inativas > 1 ? "s" : ""}`
                : "turnos manhã, tarde e noite"
            }
            icon={ListChecks}
            tone="neutral"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight">Progresso por rotina</h2>
              <Button asChild size="sm" variant="outline">
                <Link to="/checklists">Ver checklists</Link>
              </Button>
            </div>
            <ul className="mt-4 space-y-4">
              {visiveis.map((c) => {
                const p = progresso(c);
                const e = estado(c);
                return (
                  <li key={c.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{c.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.turno} · {c.horario}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "shrink-0 border-transparent",
                          e === "concluido" && "bg-primary/12 text-primary",
                          e === "em_andamento" && "bg-chart-4/20 text-chart-4",
                          e === "pendente" && "bg-muted text-muted-foreground",
                        )}
                      >
                        {estadoLabel[e]}
                      </Badge>
                    </div>
                    <Progress value={p.pct} className="h-1.5" />
                  </li>
                );
              })}
              {visiveis.length === 0 && (
                <li className="rounded-xl bg-muted/60 p-4 text-sm text-muted-foreground">
                  {isAdmin
                    ? inativas > 0
                      ? "Nenhuma rotina ativa no momento."
                      : "Nenhuma rotina cadastrada."
                    : "Nenhuma rotina com itens atribuídos a você no momento."}
                </li>
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm lg:col-span-2">
            <h2 className="text-base font-semibold tracking-tight">Pendências em destaque</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Itens que ainda precisam ser executados hoje.
            </p>
            <ul className="mt-4 space-y-3">
              {pendencias.map(({ c, i }) => (
                <li key={i.id}>
                  <Link
                    to="/checklists"
                    search={{ checklist: c.id }}
                    className="block rounded-xl bg-muted/60 p-3 transition-colors hover:bg-muted"
                  >
                    <p className="text-sm font-medium">{i.titulo}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {c.nome} · {i.responsavel}
                    </p>
                  </Link>
                </li>
              ))}
              {pendencias.length === 0 && visiveis.length > 0 && (
                <li className="rounded-xl bg-primary/10 p-4 text-sm text-primary">
                  Todas as rotinas do dia estão concluídas.
                </li>
              )}
            </ul>
          </section>
        </div>

        {isAdmin && (
          <div className="grid gap-6 lg:grid-cols-2">
            <TarefasBreakdown
              titulo="Tarefas por funcionário"
              descricao="Itens de rotina atribuídos a cada pessoa"
              icon={Users}
              dados={porFuncionario}
              rotuloItem="tarefa"
              vazio="Nenhuma tarefa atribuída nas rotinas ativas."
            />
            <TarefasBreakdown
              titulo="Tarefas por setor"
              descricao="Itens de rotina agrupados pela área da loja"
              icon={Building2}
              dados={porSetor}
              rotuloItem="tarefa"
              vazio="Nenhuma rotina ativa com tarefas."
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
