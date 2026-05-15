import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "../../components/AppShell";
import { Jobs } from "../../pages/Jobs";

export const Route = createFileRoute("/_authenticated/jobs")({
  component: () => (
    <AppShell route="configuracoes">
      <Jobs />
    </AppShell>
  ),
});
