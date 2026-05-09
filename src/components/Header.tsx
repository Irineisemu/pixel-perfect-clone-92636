// @ts-nocheck
import { useEffect, useState, useRef } from "react";
import { Icon } from "./Icon";
import { Utils } from "../lib/jr-utils";
import { useAuth } from "../lib/auth";
import { toast } from "sonner";

function initialsOf(nameOrEmail: string) {
  const s = (nameOrEmail || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export function Header({ onOpenCmdK, onNav, route, onOpenAlerts }) {
  const { user } = useAuth();
  const displayName = (user?.user_metadata as any)?.name || user?.email?.split("@")[0] || "Usuário";
  const usuario = {
    nome: displayName,
    email: user?.email || "",
    iniciais: initialsOf(displayName),
  };
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <button onClick={() => onNav("inicio")} aria-label="Ir para início" className="flex items-center gap-2 shrink-0">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-zinc-900 text-white">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 3v9l6 3" />
            </svg>
          </span>
          <span className="font-display text-[17px] tracking-tight text-zinc-900 hidden sm:inline">JusRadar</span>
        </button>

        <nav className="hidden md:flex items-center gap-1 ml-2">
          {[["inicio", "Painel", null], ["alvos", "Alvos", "target"], ["configuracoes", "Configurações", null]].map(([id, label, icon]) => (
            <button key={id} onClick={() => onNav(id)}
              className={Utils.cx(
                "px-3 h-8 rounded-md text-[13px] font-medium transition-colors inline-flex items-center gap-1.5",
                route === id ? "bg-zinc-100 text-zinc-900" : "text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50"
              )}>
              {icon && <Icon name={icon} className="h-3.5 w-3.5" />}
              {label}
            </button>
          ))}
        </nav>

        <button onClick={onOpenCmdK} aria-label="Abrir busca global (Cmd+K)"
          className="flex-1 max-w-xl mx-auto flex items-center gap-2 h-9 px-3 rounded-md border border-zinc-200 bg-zinc-50 hover:bg-white hover:border-zinc-300 transition text-left">
          <Icon name="search" className="h-4 w-4 text-zinc-400 shrink-0" />
          <span className="text-[13px] text-zinc-500 truncate flex-1">Buscar processos, partes, tribunais…</span>
          <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 h-5 rounded border border-zinc-200 bg-white text-[10px] font-medium text-zinc-500">
            <Icon name="command" className="h-3 w-3" /> K
          </kbd>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onOpenAlerts} aria-label="Notificações"
            className="relative grid h-9 w-9 place-items-center rounded-md text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900">
            <Icon name="bell" className="h-4 w-4" />
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
          </button>
          <UserMenu usuario={usuario} onNav={onNav} />
        </div>
      </div>
    </header>
  );
}

function UserMenu({ usuario, onNav }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { signOut } = useAuth();
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((s) => !s)} aria-label="Menu do usuário"
        className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-md hover:bg-zinc-50">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 text-white text-[11px] font-semibold">
          {usuario.iniciais}
        </span>
        <Icon name="chevron-down" className="h-3.5 w-3.5 text-zinc-500 hidden sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-60 rounded-lg border border-zinc-200 bg-white shadow-lg p-1 text-[13px]">
          <div className="px-3 py-2">
            <div className="font-medium text-zinc-900 truncate">{usuario.nome}</div>
            <div className="text-zinc-500 truncate text-xs">{usuario.email}</div>
          </div>
          <div className="h-px bg-zinc-100 my-1" />
          <button onClick={() => { onNav("configuracoes"); setOpen(false); }} className="w-full text-left px-3 py-1.5 rounded hover:bg-zinc-50">Configurações de alerta</button>
          <div className="h-px bg-zinc-100 my-1" />
          <button
            onClick={async () => {
              setOpen(false);
              await signOut();
              toast.success("Sessão encerrada");
              window.location.href = "/login";
            }}
            className="w-full text-left px-3 py-1.5 rounded hover:bg-zinc-50 text-zinc-600">Sair</button>
        </div>
      )}
    </div>
  );
}
export default Header;
