import * as React from "react";
import { Link } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, LogOut, Menu, Store, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";

const navBase = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/checklists", label: "Checklists", icon: ListChecks, exact: false },
] as const;

const navAdmin = [
  { to: "/funcionarios", label: "Funcionários", icon: Users, exact: false },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { isAdmin } = useAuth();
  const nav = isAdmin ? [...navBase, ...navAdmin] : navBase;

  return (
    <nav className="flex flex-col gap-1">
      {nav.map(({ to, label, icon: Icon, exact }) => (
        <Link
          key={to}
          to={to}
          onClick={onNavigate}
          activeOptions={{ exact }}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground data-[status=active]:bg-sidebar-primary data-[status=active]:text-sidebar-primary-foreground"
        >
          <Icon className="size-4.5" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function UserFooter() {
  const { profile, signOut } = useAuth();

  async function handleSignOut() {
    await signOut();
    window.location.assign("/login");
  }

  return (
    <div className="mt-auto flex items-center gap-2 rounded-xl bg-sidebar-accent p-3 text-xs text-muted-foreground">
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sidebar-foreground">{profile?.nome ?? "—"}</p>
        <p className="truncate">{profile?.role === "admin" ? "Administrador" : "Funcionário"}</p>
      </div>
      <button
        onClick={handleSignOut}
        aria-label="Sair"
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar hover:text-sidebar-foreground"
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Store className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-base font-semibold tracking-tight text-sidebar-foreground">
          Checksup
        </span>
        <span className="block text-xs text-muted-foreground">Rotinas de supermercado</span>
      </span>
    </div>
  );
}

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col lg:gap-6 lg:p-4">
        <Brand />
        <NavLinks />
        <UserFooter />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Fechar menu"
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative flex h-full w-68 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-4">
            <div className="flex items-center justify-between">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X className="size-5 text-muted-foreground" />
              </button>
            </div>
            <NavLinks onNavigate={() => setOpen(false)} />
            <UserFooter />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/85 px-4 py-4 backdrop-blur md:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">{title}</h1>
            {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        </header>
        <main className={cn("flex-1 px-4 py-6 md:px-8 md:py-8")}>{children}</main>
      </div>
    </div>
  );
}
