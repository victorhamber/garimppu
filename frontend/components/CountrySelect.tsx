export const COUNTRIES = [
  { id: "BR", label: "Brasil" },
  { id: "PT", label: "Portugal" },
  { id: "US", label: "Estados Unidos" },
  { id: "CA", label: "Canadá" },
  { id: "GB", label: "Reino Unido" },
  { id: "AU", label: "Austrália" },
  { id: "MX", label: "México" },
  { id: "AR", label: "Argentina" },
  { id: "CO", label: "Colômbia" },
  { id: "CL", label: "Chile" },
  { id: "PE", label: "Peru" },
  { id: "ES", label: "Espanha" },
  { id: "FR", label: "França" },
  { id: "IT", label: "Itália" },
  { id: "DE", label: "Alemanha" },
  { id: "AO", label: "Angola" },
  { id: "MZ", label: "Moçambique" },
];

export function CountrySelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const known = COUNTRIES.some((c) => c.id === value);
  return (
    <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value)}>
      {!known && value && <option value={value}>{value}</option>}
      {COUNTRIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
    </select>
  );
}
