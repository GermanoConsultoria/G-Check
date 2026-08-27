import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { Check, ChevronDown, Clock, Filter, RotateCcw, Trash2, User, X } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { EditarChecklistDialog, NovaChecklistDialog } from "@/components/checklist-form-dialog";
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
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";
import {
  ehResponsavel,
  estado,
  estadoLabel,
  progresso,
  turnos,
  useGCheck,
  type Checklist,
  type ChecklistEstado,
  type Turno,
} from "@/lib/g-check-store";

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
  component: ChecklistsPage,
});

const estadoOptions: { id: ChecklistEstado; label: string }[] = [
  { id: "pendente", label: "Não iniciados" },
  { id: "em_andamento", label: "Em andamento" },
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
        e === "concluido" && "bg-primary/12 text-primary",
        e === "em_andamento" && "bg-chart-4/20 text-chart-4",
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
            A checklist e seus {c.itens.length}{" "}
            {c.itens.length === 1 ? "item" : "itens"} serão removidos. Não dá para desfazer.
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

function ChecklistCard({ c }: { c: Checklist }) {
  const { toggleItem, concluirTodos, reabrir } = useGCheck();
  const { isAdmin, profile } = useAuth();
  const [aberto, setAberto] = React.useState(false);
  const p = progresso(c);

  return (
    <section
      className={cn("rounded-2xl border border-border bg-card shadow-sm", !c.ativo && "opacity-70")}
    >
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
              {!c.ativo && (
                <Badge
                  variant="outline"
                  className="border-transparent bg-muted text-muted-foreground"
                >
                  Inativa
                </Badge>
              )}
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
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-0.5">
            <EditarChecklistDialog checklist={c} />
            <ExcluirChecklistButton c={c} />
          </div>
        )}
      </div>

      {aberto && (
        <div className="border-t border-border p-5 pt-4">
          <ul className="divide-y divide-border">
            {c.itens.map((i) => {
              const feito = i.status === "concluido";
              // Admin marca qualquer item; funcionário só o que está atribuído a
              // ele (comparação por nome, ver ehResponsavel em g-check-store.tsx).
              // Reforçado no banco pela migration
              // 20260824140000_restrict_item_status_to_responsavel.sql.
              const podeMarcar = isAdmin || ehResponsavel(i, profile?.nome);
              return (
                <li key={i.id} className="flex items-start gap-3 py-3">
                  <button
                    onClick={() => podeMarcar && toggleItem(c.id, i.id)}
                    disabled={!podeMarcar}
                    aria-label={
                      !podeMarcar
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
          )}
        </div>
      )}
    </section>
  );
}

function ChecklistsPage() {
  const { checklists, isLoading, isError } = useGCheck();
  const { isAdmin, profile } = useAuth();
  const [estadosSelecionados, setEstadosSelecionados] = React.useState<ChecklistEstado[]>([]);
  const [turnosSelecionados, setTurnosSelecionados] = React.useState<Turno[]>([]);

  function toggleEstado(id: ChecklistEstado) {
    setEstadosSelecionados((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  }

  function toggleTurno(id: Turno) {
    setTurnosSelecionados((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  function limparFiltros() {
    setEstadosSelecionados([]);
    setTurnosSelecionados([]);
  }

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

  const lista = minhasChecklists.filter(
    (c) =>
      (estadosSelecionados.length === 0 || estadosSelecionados.includes(estado(c))) &&
      (turnosSelecionados.length === 0 || turnosSelecionados.includes(c.turno as Turno)),
  );

  return (
    <AppShell title="Checklists" subtitle="Rotinas operacionais da Loja Centro">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <FiltrosChecklist
            estadosSelecionados={estadosSelecionados}
            turnosSelecionados={turnosSelecionados}
            onToggleEstado={toggleEstado}
            onToggleTurno={toggleTurno}
            onLimpar={limparFiltros}
          />
          {isAdmin && <NovaChecklistDialog />}
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
