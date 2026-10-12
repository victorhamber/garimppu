"use client";

import { useEffect } from "react";

export type FilterChip<K extends string = string> = { key: K; label: string; title?: string };

/** Opens the secondary filter panel; the amber count tells how many of its filters are on. */
export function FilterToggle({ open, count, controls, onToggle }: { open: boolean; count: number; controls: string; onToggle: () => void }) {
  return (
    <button type="button" className="btn" aria-expanded={open} aria-controls={controls} onClick={onToggle}>
      Filtros
      {count > 0 && <span className="font-mono text-accent">{count}</span>}
      <svg viewBox="0 0 24 24" className={`size-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
        fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Active filters as removable chips, so the collapsed panel still shows what is narrowing the result. */
export function FilterChips<K extends string>({ chips, onRemove, onClear }: {
  chips: FilterChip<K>[];
  onRemove: (key: K) => void;
  onClear?: () => void;
}) {
  if (chips.length === 0 && !onClear) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.length > 0 && (
        <ul aria-label="Filtros ativos" className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <li key={chip.key} className="flex items-center gap-1 rounded-full border border-accent/40 py-0.5 pr-1 pl-3 text-xs text-accent">
              <span className="max-w-48 truncate sm:max-w-72" title={chip.title ?? chip.label}>{chip.label}</span>
              <button type="button" onClick={() => onRemove(chip.key)} aria-label={`Remover filtro ${chip.label}`}
                className="flex size-5 items-center justify-center rounded-full text-muted hover:text-foreground pointer-coarse:size-9">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      {onClear && (
        <button type="button" className="btn btn-ghost ml-auto h-7 text-xs text-muted pointer-coarse:h-11" onClick={onClear}>
          Limpar filtros
        </button>
      )}
    </div>
  );
}

/** Labelled select for the filter panel; the empty option means "no filter". */
export function FilterSelect({ id, label, value, options, onChange }: {
  id: string;
  label: string;
  value?: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <select id={id} className="field" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  );
}

/** Sort control that sits beside the result count. */
export function SortSelect({ id, value, options, onChange }: {
  id: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only sm:not-sr-only">Ordenar por</label>
      <select id={id} className="field h-8 w-auto py-0 text-xs pointer-coarse:h-11" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </span>
  );
}

/** Inline checkbox beside "Somente ativos"; an empty URL value means the default (off). */
export function CheckToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-6 cursor-pointer items-center gap-2 text-sm text-muted pointer-coarse:min-h-11">
      <input type="checkbox" className="accent-[var(--accent)] pointer-coarse:size-5" checked={checked}
        onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

/** Whose ads to rank: the user's own searches (default) or everything any customer has mined. */
export function ScopeToggle({ value, onChange }: { value?: string; onChange: (value: string) => void }) {
  const all = value === "all";
  const option = (active: boolean) =>
    `rounded px-2.5 py-1 transition-colors pointer-coarse:min-h-11 ${active ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"}`;
  return (
    <div role="group" aria-label="Origem dos anúncios" className="flex items-center gap-0.5 rounded-md border border-line p-0.5 text-sm">
      <button type="button" aria-pressed={!all} className={option(!all)} onClick={() => onChange("")}>Minhas buscas</button>
      <button type="button" aria-pressed={all} className={option(all)} onClick={() => onChange("all")}
        title="Inclui o que outros clientes já mineraram">
        Toda a base
      </button>
    </div>
  );
}

/** Says what the default brand filter took out of the ranking and why, with a way back. */
export function HiddenBrandsNote({ count, noun, onShow }: { count: number; noun: string; onShow: () => void }) {
  if (count <= 0) return null;
  return (
    <p className="text-xs text-muted">
      <span className="font-mono tabular-nums text-foreground">{count.toLocaleString("pt-BR")}</span> {noun} de marcas
      grandes fora do ranking: Boticário, 99, Amazon e afins não podem ser promovidas por afiliados.{" "}
      <button type="button" onClick={onShow}
        className="text-foreground underline decoration-line underline-offset-2 transition-colors hover:decoration-accent pointer-coarse:min-h-11">
        Mostrar mesmo assim
      </button>
    </p>
  );
}

/** Key cap inside an empty search field; hidden on touch, where there is no keyboard shortcut. */
export function SlashHint() {
  return (
    <kbd aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-line px-1.5 font-mono text-micro leading-5 text-muted pointer-fine:md:block">
      /
    </kbd>
  );
}

/** "/" jumps to the page's search field, as in most search-led tools; ignored while typing elsewhere. */
export function useSlashFocus(inputId: string) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const input = document.getElementById(inputId) as HTMLInputElement | null;
      if (!input) return;
      e.preventDefault();
      input.focus();
      input.select();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [inputId]);
}
