import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { Alvos } from "../pages/Alvos";

export const Route = createFileRoute("/_authenticated/alvos")({
  component: () => (
    <AppShell route="alvos">
      <Alvos />
    </AppShell>
  ),
});
