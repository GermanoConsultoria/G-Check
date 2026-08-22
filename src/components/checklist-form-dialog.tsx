import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { turnos, useChecksup, type Checklist } from "@/lib/checksup-store";

const itemSchema = z.object({
  itemId: z.string().optional(),
  titulo: z.string().trim().min(1, "Informe o título do item."),
  detalhe: z.string().trim().optional(),
  responsavel: z.string().trim().min(1, "Informe o responsável."),
});

const checklistSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome da checklist."),
  setor: z.string().trim().min(1, "Informe o setor."),
  turno: z.enum(turnos, { message: "Selecione o turno." }),
  horario: z.string().trim().min(1, "Informe o horário."),
  itens: z.array(itemSchema).min(1, "Adicione ao menos um item."),
});

type ChecklistFormValues = z.infer<typeof checklistSchema>;

const itemVazio = { titulo: "", detalhe: "", responsavel: "" };

function turnoOuPadrao(turno: string): (typeof turnos)[number] {
  return (turnos as readonly string[]).includes(turno)
    ? (turno as (typeof turnos)[number])
    : turnos[0];
}

function valoresPadrao(checklist?: Checklist): ChecklistFormValues {
  if (!checklist) {
    return { nome: "", setor: "", turno: turnos[0], horario: "", itens: [itemVazio] };
  }
  return {
    nome: checklist.nome,
    setor: checklist.setor,
    turno: turnoOuPadrao(checklist.turno),
    horario: checklist.horario,
    itens: checklist.itens.map((i) => ({
      itemId: i.id,
      titulo: i.titulo,
      detalhe: i.detalhe ?? "",
      responsavel: i.responsavel,
    })),
  };
}

function ChecklistFormDialog({ checklist }: { checklist?: Checklist }) {
  const { criarChecklist, editarChecklist } = useChecksup();
  const [open, setOpen] = React.useState(false);
  const editando = !!checklist;

  const form = useForm<ChecklistFormValues>({
    resolver: zodResolver(checklistSchema),
    defaultValues: valoresPadrao(checklist),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "itens",
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    form.reset(valoresPadrao(checklist));
  }

  function onSubmit(values: ChecklistFormValues) {
    const itens = values.itens.map((i) => {
      const detalhe = i.detalhe?.trim();
      return {
        ...(i.itemId ? { id: i.itemId } : {}),
        titulo: i.titulo,
        responsavel: i.responsavel,
        ...(detalhe ? { detalhe } : {}),
      };
    });

    const dados = {
      nome: values.nome,
      setor: values.setor,
      turno: values.turno,
      horario: values.horario,
      itens,
    };
    if (editando && checklist) {
      editarChecklist(checklist.id, dados);
    } else {
      criarChecklist(dados);
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {editando ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={`Editar ${checklist.nome}`}
          >
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Nova checklist
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar checklist" : "Nova checklist"}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem className="sm:col-span-2">
                    <FormLabel>Nome da checklist</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Inventário de bebidas" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="setor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Setor</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Comercial" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="turno"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Turno</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {turnos.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="horario"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Horário</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Itens da checklist</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => append(itemVazio)}>
                  <Plus className="size-4" /> Adicionar item
                </Button>
              </div>

              {form.formState.errors.itens?.message && (
                <p className="text-[0.8rem] font-medium text-destructive">
                  {form.formState.errors.itens.message}
                </p>
              )}

              <div className="space-y-4">
                {fields.map((f, index) => (
                  <div key={f.id} className="space-y-3 rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-muted-foreground">Item {index + 1}</p>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        aria-label={`Remover item ${index + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <FormField
                      control={form.control}
                      name={`itens.${index}.titulo`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Título</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex.: Conferir contagem de estoque" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`itens.${index}.detalhe`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Detalhe (opcional)</FormLabel>
                          <FormControl>
                            <Textarea rows={2} placeholder="Instruções adicionais" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`itens.${index}.responsavel`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Responsável</FormLabel>
                          <FormControl>
                            <Input placeholder="Ex.: Ana P." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editando ? "Salvar alterações" : "Criar checklist"}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function NovaChecklistDialog() {
  return <ChecklistFormDialog />;
}

export function EditarChecklistDialog({ checklist }: { checklist: Checklist }) {
  return <ChecklistFormDialog checklist={checklist} />;
}
