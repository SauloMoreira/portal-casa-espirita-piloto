export const AGE_GROUPS = [
  { label: "Até 17", min: 0, max: 17 },
  { label: "18–24", min: 18, max: 24 },
  { label: "25–34", min: 25, max: 34 },
  { label: "35–44", min: 35, max: 44 },
  { label: "45–59", min: 45, max: 59 },
  { label: "60+", min: 60, max: 999 },
] as const;

export function calcAge(birthDate: string | null, refDate?: Date): number | null {
  if (!birthDate) return null;
  const ref = refDate ?? new Date();
  const birth = new Date(birthDate + "T00:00:00");
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) age--;
  return age;
}

export function getAgeGroup(age: number | null): string {
  if (age === null) return "Não informado";
  for (const g of AGE_GROUPS) {
    if (age >= g.min && age <= g.max) return g.label;
  }
  return "Não informado";
}

export function buildAgeDistribution(assistidos: { data_nascimento: string | null }[]) {
  const dist: Record<string, number> = {};
  AGE_GROUPS.forEach((g) => (dist[g.label] = 0));
  dist["Não informado"] = 0;
  assistidos.forEach((a) => {
    const group = getAgeGroup(calcAge(a.data_nascimento));
    dist[group] = (dist[group] || 0) + 1;
  });
  return Object.entries(dist)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));
}
