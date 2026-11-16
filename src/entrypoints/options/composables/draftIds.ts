// Geração de ids de regras e campos.

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

function randomSuffix(rng: () => number): string {
  let out = '';
  while (out.length < 4) out += Math.floor(rng() * 36).toString(36);
  return out;
}

/** Slug do nome + sufixo aleatório curto, garantindo que não colide com `existingIds`. */
export function generateRuleId(
  name: string,
  existingIds: Iterable<string> = [],
  rng: () => number = Math.random,
): string {
  const taken = new Set(existingIds);
  const slug = slugify(name) || 'regra';
  for (let i = 0; i < 1000; i++) {
    const id = `${slug}-${randomSuffix(rng)}`;
    if (!taken.has(id)) return id;
  }
  let n = 2;
  while (taken.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

/** Próximo id `campo-N` ainda não usado. */
export function nextFieldId(fields: readonly { id: string }[]): string {
  const used = new Set(fields.map((f) => f.id));
  let max = 0;
  for (const id of used) {
    const m = /^campo-(\d+)$/.exec(id);
    if (m?.[1]) max = Math.max(max, Number(m[1]));
  }
  let n = max + 1;
  while (used.has(`campo-${n}`)) n++;
  return `campo-${n}`;
}
