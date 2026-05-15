import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../../components/AppShell";
import { Credenciais } from "../../pages/Credenciais";

export const Route = createFileRoute("/_authenticated/credenciais")({
  component: () => (
    <AppShell route="configuracoes">
      <Credenciais />
    </AppShell>
  ),
});
