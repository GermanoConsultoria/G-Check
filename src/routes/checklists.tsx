import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarOff,
  Check,
  ChevronDown,
  Clock,
  Filter,
  RotateCcw,
  Trash2,
  User,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EditarChecklistDialog, NovaChecklistDialog } from "@/components/checklist-form-dialog";
import { CalendarioChecklists } from "@/components/calendario-checklists";
import { SeletorDia } from "@/components/seletor-dia";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { cn, dataDoIso } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import {
  DIAS_DESATIVADOS_QUERY_KEY,
  reativarDia,
  useHojeDesativado,
} from "@/lib/dias-desativados";
import {
  ehResponsavel,
  estado,
  estadoLabel,
  labelDiasSemana,
  progresso,
  rodaNoDia,
  turnos,
  useGCheck,
  type Checklist,
  type ChecklistEstado,
  type ChecklistItem,
  type Turno,
} from "@/lib/g-check-store";

const ESTADOS_VALIDOS: ChecklistEstado[] = ["pendente", "em_andamento", "atrasada", "concluido"];

/**
 * Filtros (e o card a destacar) vêm pela URL — assim o dashboard pode linkar
 * direto para "/checklists" já com um recorte aplicado, e o estado do filtro
 * fica compartilhável/versionável pelo histórico do navegador.
 */
export interface ChecklistSearch {
  estados?: ChecklistEstado[] | undefined;
  turnos?: Turno[] | undefined;
  /** id da checklist que deve abrir expandida e receber scroll ao entrar na página. */
  checklist?: string | undefined;
  /** dia (ISO "yyyy-MM-dd") escolhido no seletor "Hoje": filtra pelas rotinas daquele dia da semana. */
  dia?: string | undefined;
  /** "calendario" troca o conteúdo do <main> pela tela de calendário (header/sidebar seguem). */
  vista?: "calendario" | undefined;
}

export const Route = createFileRoute("/checklists")({
  head: () => ({
    meta: [
      { title: "Checklists de rotina — G-check" },
      {
        name: "description",
        content:
          "Abra e conclua rotinas de supermercado: abertura, reposição de gôndolas, validade, limpeza e fechamento.",
      },
      { property: "og:title", content: "Checklists de rotina — G-check" },
      {
        property: "og:description",
        content: "Acompanhe item por item as rotinas operacionais da sua loja.",
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): ChecklistSearch => {
    const rawEstados = search["estados"];
    const rawTurnos = search["turnos"];
    const rawChecklist = search["checklist"];
    const rawDia = search["dia"];
    const rawVista = search["vista"];

    const estados = Array.isArray(rawEstados)
      ? rawEstados.filter((e): e is ChecklistEstado =>
          ESTADOS_VALIDOS.includes(e as ChecklistEstado),
        )
      : undefined;
    const turnosSearch = Array.isArray(rawTurnos)
      ? rawTurnos.filter((t): t is Turno => (turnos as readonly string[]).includes(t as string))
      : undefined;
    const checklist = typeof rawChecklist === "string" ? rawChecklist : undefined;
    const dia =
      typeof rawDia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDia) ? rawDia : undefined;
    const vista = rawVista === "calendario" ? "calendario" : undefined;

    return {
      ...(estados && estados.length ? { estados } : {}),
      ...(turnosSearch && turnosSearch.length ? { turnos: turnosSearch } : {}),
      ...(checklist ? { checklist } : {}),
      ...(dia ? { dia } : {}),
      ...(vista ? { vista } : {}),
    };
  },
  component: ChecklistsPage,
});

const estadoOptions: { id: ChecklistEstado; label: string }[] = [
  { id: "pendente", label: "Não iniciados" },
  { id: "em_andamento", label: "Em andamento" },
  { id: "atrasada", label: "Atrasadas" },
  { id: "concluido", label: "Concluídos" },
];

const turnoOptions: { id: Turno; label: string }[] = turnos.map((t) => ({ id: t, label: t }));

/**
 * Botão de filtros: abre um popover com as opções agrupadas (Estado/Turno)
 * onde cada clique já liga/desliga aquele filtro (multi-seleção, sem passo
 * extra de "aplicar"). As opções ativas aparecem como badges removíveis ao
 * lado, cada uma com seu próprio X.
 */
function FiltrosChecklist({
  estadosSelecionados,
  turnosSelecionados,
  onToggleEstado,
  onToggleTurno,
  onLimpar,
}: {
  estadosSelecionados: ChecklistEstado[];
  turnosSelecionados: Turno[];
  onToggleEstado: (id: ChecklistEstado) => void;
  onToggleTurno: (id: Turno) => void;
  onLimpar: () => void;
}) {
  const total = estadosSelecionados.length + turnosSelecionados.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="size-4" />
            Filtros
            {total > 0 && (
              <Badge className="h-5 min-w-5 justify-center rounded-full border-transparent bg-primary px-1 text-primary-foreground">
                {total}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-60 p-0">
          <Command>
            <CommandList>
              <CommandGroup heading="Estado">
                {estadoOptions.map((o) => {
                  const ativo = estadosSelecionados.includes(o.id);
                  return (
                    <CommandItem
                      key={o.id}
                      onSelect={() => onToggleEstado(o.id)}
                      className="justify-between"
                    >
                      {o.label}
                      {ativo && <Check className="size-4 text-primary" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Turno">
                {turnoOptions.map((o) => {
                  const ativo = turnosSelecionados.includes(o.id);
                  return (
                    <CommandItem
                      key={o.id}
                      onSelect={() => onToggleTurno(o.id)}
                      className="justify-between"
                    >
                      {o.label}
                      {ativo && <Check className="size-4 text-primary" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {estadosSelecionados.map((id) => (
        <Badge key={id} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1.5 font-medium">
          {estadoOptions.find((o) => o.id === id)?.label}
          <button
            onClick={() => onToggleEstado(id)}
            aria-label={`Remover filtro ${estadoLabel[id]}`}
            className="rounded-full p-0.5 hover:bg-foreground/10"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {turnosSelecionados.map((t) => (
        <Badge key={t} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1.5 font-medium">
          {t}
          <button
            onClick={() => onToggleTurno(t)}
            aria-label={`Remover filtro ${t}`}
            className="rounded-full p-0.5 hover:bg-foreground/10"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {total > 0 && (
        <button
          onClick={onLimpar}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Limpar tudo
        </button>
      )}
    </div>
  );
}

function EstadoBadge({ c }: { c: Checklist }) {
  const e = estado(c);
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium",
        e === "concluido" && "bg-success/15 text-success",
        e === "em_andamento" && "bg-chart-4/20 text-chart-4",
        e === "atrasada" && "bg-destructive/15 text-destructive",
        e === "pendente" && "bg-muted text-muted-foreground",
      )}
    >
      {estadoLabel[e]}
    </Badge>
  );
}

function ExcluirChecklistButton({ c }: { c: Checklist }) {
  const { excluirChecklist } = useGCheck();

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={`Excluir ${c.nome}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir “{c.nome}”?</AlertDialogTitle>
          <AlertDialogDescription>
            A checklist e seus {c.itens.length} {c.itens.length === 1 ? "item" : "itens"} serão
            removidos. Não dá para desfazer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => excluirChecklist(c.id)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ChecklistCard({
  c,
  destacar = false,
  travado = false,
  foraDoDia = false,
}: {
  c: Checklist;
  destacar?: boolean | undefined;
  /** Dia pausado (feriado): itens não podem ser marcados/concluídos/reabertos. */
  travado?: boolean | undefined;
  /** Rotina não programada para hoje (diasSemana) — aparece "desativada". */
  foraDoDia?: boolean | undefined;
}) {
  const { toggleItem, concluirTodos, reabrir } = useGCheck();
  const { isAdmin, profile } = useAuth();
  const [aberto, setAberto] = React.useState(destacar);
  const sectionRef = React.useRef<HTMLElement>(null);
  const p = progresso(c);
  // Dia pausado ou fora da programação: a rotina não abre nem aceita marcação —
  // o card fica só com o cabeçalho.
  const bloqueado = travado || foraDoDia;
  const expandido = aberto && !bloqueado;

  // Chegou pela URL "?checklist=<id>" (link de uma pendência no dashboard):
  // rola até a card e a deixa expandida.
  React.useEffect(() => {
    if (destacar) sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [destacar]);

  return (
    <section
      ref={sectionRef}
      className={cn(
        "scroll-mt-24 rounded-2xl border border-border bg-card shadow-sm transition-shadow",
        (!c.ativo || bloqueado) && "opacity-70",
        destacar && "ring-2 ring-primary/60",
      )}
    >
      <div className="flex items-start gap-2 p-5">
        <button
          onClick={() => setAberto((v) => !v)}
          disabled={bloqueado}
          className="flex min-w-0 flex-1 flex-col gap-4 text-left disabled:cursor-not-allowed"
          aria-expanded={expandido}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight">{c.nome}</h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>{c.setor}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" /> {c.turno} · {c.horario}
                  {c.tempoLimite && ` · até ${c.tempoLimite}`}
                </span>
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" /> {labelDiasSemana(c.diasSemana)}
                </span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {!c.ativo && (
                <Badge
                  variant="outline"
                  className="border-transparent bg-muted text-muted-foreground"
                >
                  Inativa
                </Badge>
              )}
              {bloqueado ? (
                <Badge
                  variant="outline"
                  className="border-transparent bg-muted text-muted-foreground"
                >
                  Desativada hoje
                </Badge>
              ) : (
                <EstadoBadge c={c} />
              )}
              {!bloqueado && (
                <ChevronDown
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    expandido && "rotate-180",
                  )}
                />
              )}
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
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-0.5">
            <EditarChecklistDialog checklist={c} />
            <ExcluirChecklistButton c={c} />
          </div>
        )}
      </div>

      {expandido && (
        <div className="border-t border-border p-5 pt-4">
          <ul className="divide-y divide-border">
            {c.itens.map((i) => {
              const feito = i.status === "concluido";
              // Admin marca qualquer item; funcionário só o que está atribuído a
              // ele (comparação por nome, ver ehResponsavel em g-check-store.tsx).
              // Reforçado no banco pela migration
              // 20260824140000_restrict_item_status_to_responsavel.sql.
              const podeMarcar = !bloqueado && (isAdmin || ehResponsavel(i, profile?.nome));
              return (
                <li key={i.id} className="flex items-start gap-3 py-3">
                  <button
                    onClick={() => podeMarcar && toggleItem(c.id, i.id)}
                    disabled={!podeMarcar}
                    aria-label={
                      bloqueado
                        ? "Rotina desativada hoje"
                        : !podeMarcar
                          ? `Item atribuído a ${i.responsavel}`
                          : feito
                            ? `Reabrir ${i.titulo}`
                            : `Concluir ${i.titulo}`
                    }
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                      feito
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input hover:border-primary",
                      !podeMarcar && "cursor-not-allowed opacity-50 hover:border-input",
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
          {isAdmin && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => concluirTodos(c.id)}
                disabled={bloqueado || p.pendentes === 0}
              >
                <Check className="size-4" /> Concluir rotina
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => reabrir(c.id)}
                disabled={bloqueado || p.feitos === 0}
              >
                <RotateCcw className="size-4" /> Reabrir
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Faixa exibida quando as rotinas de hoje estão desativadas (feriado). Para o
 * funcionário é só informativa; para o admin traz o atalho de reativar (a ação
 * "oficial" de pausar/retomar fica no dashboard, em PausaRotinasHoje).
 */
function BannerRotinasPausadas({ hojeISO }: { hojeISO: string }) {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [enviando, setEnviando] = React.useState(false);

  async function reativar() {
    setEnviando(true);
    try {
      await reativarDia(hojeISO);
      toast.success("Rotinas de hoje reativadas.");
      queryClient.invalidateQueries({ queryKey: DIAS_DESATIVADOS_QUERY_KEY });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível reativar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-chart-4/30 bg-chart-4/10 p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-chart-4/20 text-chart-4">
          <CalendarOff className="size-4.5" />
        </span>
        <div>
          <p className="text-sm font-semibold">Rotinas de hoje desativadas</p>
          <p className="text-xs text-muted-foreground">
            A marcação de itens está travada hoje.{" "}
            {isAdmin ? "Reative para voltar a registrar." : "Fale com o administrador."}
          </p>
        </div>
      </div>
      {isAdmin && (
        <Button size="sm" variant="outline" disabled={enviando} onClick={reativar}>
          {enviando ? "Reativando…" : "Reativar rotinas de hoje"}
        </Button>
      )}
    </section>
  );
}

const fmtDataTarefa = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/**
 * Uma tarefa (item) do funcionário: o item em si, a rotina a que pertence e o
 * estado derivado só daquela tarefa — concluída, atrasada (rotina passou do
 * tempo limite sem terminar) ou pendente.
 */
interface TarefaFuncionario {
  checklist: Checklist;
  item: ChecklistItem;
  estado: ChecklistEstado;
}

function estadoDaTarefa(c: Checklist, i: ChecklistItem): ChecklistEstado {
  if (i.status === "concluido") return "concluido";
  return estado(c) === "atrasada" ? "atrasada" : "pendente";
}

/**
 * Linha da lista de tarefas do funcionário: check para concluir + título da
 * tarefa, a rotina a que pertence logo abaixo e, no fim da linha, horário, data
 * e o estado atual.
 */
function TarefaRow({
  tarefa,
  data,
  bloqueado,
}: {
  tarefa: TarefaFuncionario;
  data: Date;
  bloqueado: boolean;
}) {
  const { toggleItem } = useGCheck();
  const { checklist: c, item: i, estado: est } = tarefa;
  const feito = i.status === "concluido";

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
      <button
        onClick={() => !bloqueado && toggleItem(c.id, i.id)}
        disabled={bloqueado}
        aria-label={
          bloqueado
            ? "Rotina desativada hoje"
            : feito
              ? `Reabrir ${i.titulo}`
              : `Concluir ${i.titulo}`
        }
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          feito
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input hover:border-primary",
          bloqueado && "cursor-not-allowed opacity-50 hover:border-input",
        )}
      >
        {feito && <Check className="size-3.5" />}
      </button>

      <div className="min-w-0 flex-1 basis-48">
        <p
          className={cn(
            "truncate text-sm font-medium",
            feito && "text-muted-foreground line-through",
          )}
        >
          {i.titulo}
        </p>
        <p className="truncate text-xs text-muted-foreground">{c.nome}</p>
      </div>

      <div className="flex shrink-0 items-center gap-3 pl-8 sm:pl-0">
        <div className="flex flex-col items-end gap-0.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" /> {c.horario}
            {c.tempoLimite && ` · até ${c.tempoLimite}`}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" /> {fmtDataTarefa.format(data)}
          </span>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 border-transparent font-medium",
            est === "concluido" && "bg-success/15 text-success",
            est === "atrasada" && "bg-destructive/15 text-destructive",
            est === "pendente" && "bg-muted text-muted-foreground",
          )}
        >
          {estadoLabel[est]}
        </Badge>
      </div>
    </li>
  );
}

function TarefasFuncionarioLista({
  tarefas,
  data,
  bloqueado,
  comFiltro,
}: {
  tarefas: TarefaFuncionario[];
  data: Date;
  bloqueado: boolean;
  comFiltro: boolean;
}) {
  if (tarefas.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        {comFiltro ? "Nenhuma tarefa para esse recorte." : "Você não tem tarefas para hoje."}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {tarefas.map((t) => (
        <TarefaRow
          key={`${t.checklist.id}-${t.item.id}`}
          tarefa={t}
          data={data}
          bloqueado={bloqueado}
        />
      ))}
    </ul>
  );
}

function ChecklistsPage() {
  const { checklists, isLoading, isError } = useGCheck();
  const { isAdmin, profile } = useAuth();
  const { hojeISO, hojeDesativado } = useHojeDesativado();
  const {
    estados,
    turnos: turnosSearch,
    checklist: checklistDestaque,
    dia,
    vista,
  } = Route.useSearch();
  const navigate = Route.useNavigate();

  const estadosSelecionados = React.useMemo(() => estados ?? [], [estados]);
  const turnosSelecionados = React.useMemo(() => turnosSearch ?? [], [turnosSearch]);

  const toggleEstado = React.useCallback(
    (id: ChecklistEstado) => {
      navigate({
        search: (prev) => {
          const atuais = prev.estados ?? [];
          const proximo = atuais.includes(id) ? atuais.filter((e) => e !== id) : [...atuais, id];
          return { ...prev, estados: proximo.length ? proximo : undefined };
        },
      });
    },
    [navigate],
  );

  const toggleTurno = React.useCallback(
    (id: Turno) => {
      navigate({
        search: (prev) => {
          const atuais = prev.turnos ?? [];
          const proximo = atuais.includes(id) ? atuais.filter((t) => t !== id) : [...atuais, id];
          return { ...prev, turnos: proximo.length ? proximo : undefined };
        },
      });
    },
    [navigate],
  );

  const limparFiltros = React.useCallback(() => {
    navigate({ search: (prev) => ({ ...prev, estados: undefined, turnos: undefined }) });
  }, [navigate]);

  const selecionarDia = React.useCallback(
    (iso: string | undefined) => {
      navigate({ search: (prev) => ({ ...prev, dia: iso || undefined }) });
    },
    [navigate],
  );

  const abrirCalendario = React.useCallback(() => {
    navigate({ search: (prev) => ({ ...prev, vista: "calendario" }) });
  }, [navigate]);

  const fecharCalendario = React.useCallback(() => {
    navigate({ search: (prev) => ({ ...prev, vista: undefined }) });
  }, [navigate]);

  const abrirDia = React.useCallback(
    (iso: string) => {
      navigate({ search: (prev) => ({ ...prev, dia: iso, vista: undefined }) });
    },
    [navigate],
  );

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

  const minhasChecklists = isAdmin
    ? checklists
    : checklists.filter((c) => c.ativo && c.itens.some((i) => ehResponsavel(i, profile?.nome)));

  if (vista === "calendario") {
    return (
      <AppShell title="Checklists" subtitle="Calendário de rotinas">
        <CalendarioChecklists
          checklists={minhasChecklists}
          diaInicial={dia}
          onVoltar={fecharCalendario}
          onAbrirDia={abrirDia}
        />
      </AppShell>
    );
  }

  // "?dia=" traz um dia específico do calendário; como as tarefas só têm dia da
  // semana (checklist.diasSemana), o filtro casa pelo getDay() daquela data.
  const diaSemanaAlvo = dia ? dataDoIso(dia).getDay() : null;

  // Sem "?dia=", rotina não programada para hoje aparece "desativada" (bloqueada).
  // Funcionário nem vê; admin vê marcada. Filtro de estado esconde essas (não têm
  // estado do dia).
  const foraDoDia = (c: Checklist) => diaSemanaAlvo === null && !rodaNoDia(c);

  const lista = minhasChecklists.filter((c) => {
    if (turnosSelecionados.length > 0 && !turnosSelecionados.includes(c.turno as Turno)) {
      return false;
    }
    if (diaSemanaAlvo !== null && !c.diasSemana.includes(diaSemanaAlvo)) return false;
    if (foraDoDia(c)) return isAdmin && estadosSelecionados.length === 0;
    return estadosSelecionados.length === 0 || estadosSelecionados.includes(estado(c));
  });

  // Data mostrada em cada tarefa: o dia escolhido no seletor ou hoje.
  const dataAlvo = dia ? dataDoIso(dia) : new Date();

  // Funcionário não vê a rotina inteira: percorre os itens atribuídos a ele
  // (nas rotinas que passam pelos mesmos filtros de turno/dia) e monta uma
  // lista plana de tarefas, ordenada pelo que precisa de ação primeiro.
  const tarefasFuncionario: TarefaFuncionario[] = isAdmin
    ? []
    : minhasChecklists
        .filter((c) => {
          if (turnosSelecionados.length > 0 && !turnosSelecionados.includes(c.turno as Turno)) {
            return false;
          }
          if (diaSemanaAlvo !== null && !c.diasSemana.includes(diaSemanaAlvo)) return false;
          return !foraDoDia(c);
        })
        .flatMap((c) =>
          c.itens
            .filter((i) => ehResponsavel(i, profile?.nome))
            .map((i) => ({ checklist: c, item: i, estado: estadoDaTarefa(c, i) })),
        )
        .filter((t) => estadosSelecionados.length === 0 || estadosSelecionados.includes(t.estado))
        .sort(
          (a, b) =>
            a.checklist.horario.localeCompare(b.checklist.horario) ||
            a.item.titulo.localeCompare(b.item.titulo),
        );

  const temFiltro =
    estadosSelecionados.length > 0 || turnosSelecionados.length > 0 || diaSemanaAlvo !== null;

  return (
    <AppShell
      title="Checklists"
      subtitle={isAdmin ? "Rotinas operacionais da Loja Centro" : "Suas tarefas do dia"}
    >
      <div className="mx-auto max-w-4xl space-y-5">
        {hojeDesativado && <BannerRotinasPausadas hojeISO={hojeISO} />}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <FiltrosChecklist
              estadosSelecionados={estadosSelecionados}
              turnosSelecionados={turnosSelecionados}
              onToggleEstado={toggleEstado}
              onToggleTurno={toggleTurno}
              onLimpar={limparFiltros}
            />
            <SeletorDia
              diaSelecionado={dia}
              onSelectDia={selecionarDia}
              onVerCalendario={abrirCalendario}
              checklists={minhasChecklists}
            />
          </div>
          {isAdmin && <NovaChecklistDialog />}
        </div>

        {isAdmin ? (
          <div className="space-y-4">
            {lista.map((c) => (
              <ChecklistCard
                key={c.id}
                c={c}
                destacar={c.id === checklistDestaque}
                travado={hojeDesativado}
                foraDoDia={foraDoDia(c)}
              />
            ))}
            {lista.length === 0 && (
              <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                {diaSemanaAlvo !== null
                  ? "Nenhuma rotina para o dia escolhido."
                  : "Nenhuma rotina neste estado."}
              </p>
            )}
          </div>
        ) : (
          <TarefasFuncionarioLista
            tarefas={tarefasFuncionario}
            data={dataAlvo}
            bloqueado={hojeDesativado}
            comFiltro={temFiltro}
          />
        )}
      </div>
    </AppShell>
  );
}
