import { API_URL, toQuery } from "@/lib/api";

const EXPORT_LIMIT = 5000;

type Props = {
  /** List endpoint's CSV route, e.g. "/api/offers/export.csv". */
  path: string;
  filters: Record<string, string | undefined>;
  disabled?: boolean;
  className?: string;
};

/** Downloads what the list is showing (same filters and order), up to 5.000 rows. */
export function ExportCsv({ path, filters, disabled, className = "" }: Props) {
  const label = "Exportar CSV";
  const classes = `btn h-8 text-xs pointer-coarse:h-11 ${className}`;
  if (disabled) {
    return <button type="button" disabled className={classes}>{label}</button>;
  }
  return (
    <a href={`${API_URL}${path}${toQuery({ ...filters, limit: EXPORT_LIMIT })}`} className={classes}
      title="Baixa a lista com estes filtros e esta ordem (até 5.000 linhas)">
      {label}
    </a>
  );
}
