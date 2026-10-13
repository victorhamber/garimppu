"use client";

import { useEffect, useState } from "react";
import { apiFile, toQuery } from "@/lib/api";

const EXPORT_LIMIT = 5000;

type Props = {
  /** List endpoint's CSV route, e.g. "/api/offers/export.csv". */
  path: string;
  filters: Record<string, string | undefined>;
  disabled?: boolean;
  className?: string;
};

/** Rows after the header; ad copy carries line breaks inside quoted fields, so only unquoted newlines count. */
function dataRows(csv: string): number {
  const text = csv.trimEnd();
  if (!text) return 0;
  let lines = 1;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "\n" && !quoted) lines++;
  }
  return lines - 1;
}

type State = { kind: "idle" } | { kind: "busy" } | { kind: "done"; rows: number } | { kind: "error"; message: string };

/** Downloads what the list is showing (same filters and order), up to 5.000 rows, and says how it went. */
export function ExportCsv({ path, filters, disabled, className = "" }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    if (state.kind !== "done") return;
    const timer = setTimeout(() => setState({ kind: "idle" }), 4000);
    return () => clearTimeout(timer);
  }, [state]);

  async function download() {
    setState({ kind: "busy" });
    try {
      const { blob, filename } = await apiFile(`${path}${toQuery({ ...filters, limit: EXPORT_LIMIT })}`);
      const rows = dataRows(await blob.text());
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename ?? path.split("/").slice(-2, -1)[0] + ".csv";
      link.click();
      URL.revokeObjectURL(url);
      setState({ kind: "done", rows });
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  const note = state.kind === "busy" ? "Gerando o CSV..."
    : state.kind === "done" ? `CSV baixado: ${state.rows.toLocaleString("pt-BR")} ${state.rows === 1 ? "linha" : "linhas"}${state.rows >= EXPORT_LIMIT ? " (limite)" : ""}`
    : state.kind === "error" ? `Não foi possível exportar. ${state.message}`
    : "";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span role="status" className={`text-xs empty:hidden ${state.kind === "error" ? "text-danger" : "text-muted"}`}>{note}</span>
      <button type="button" onClick={download} disabled={disabled || state.kind === "busy"}
        className="btn h-8 text-xs pointer-coarse:h-11">
        {state.kind === "error" ? "Tentar de novo" : "Exportar CSV"}
      </button>
    </span>
  );
}
