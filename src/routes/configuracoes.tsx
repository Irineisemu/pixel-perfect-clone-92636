import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { Configuracoes } from "../pages/Configuracoes";

export const Route = createFileRoute("/configuracoes")({
  component: () => (
    <AppShell route="configuracoes">
      <Configuracoes />
    </AppShell>
  ),
});
