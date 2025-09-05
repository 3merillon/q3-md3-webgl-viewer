function stripJsonComments(text) {
  // Preserves strings and escapes; strips // line and /* block */ comments.
  let out = '';
  let i = 0;
  let inStr = false;
  let quote = '';
  let inLine = false;
  let inBlock = false;

  while (i < text.length) {
    const ch = text[i];
    const next = i + 1 < text.length ? text[i + 1] : '';

    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out += ch;
      }
      i++;
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }
    if (inStr) {
      out += ch;
      if (ch === '\\') {
        // escape next char (if present)
        if (i + 1 < text.length) {
          out += text[i + 1];
          i += 2;
          continue;
        }
      } else if (ch === quote) {
        inStr = false;
        quote = '';
      }
      i++;
      continue;
    }

    // Not in string/comment
    if (ch === '"' || ch === '\'') {
      inStr = true;
      quote = ch;
      out += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i += 2;
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}

async function fetchIndexWithComments(pathBase) {
  // Try .jsonc then .json; parse JSONC if present.
  const candidates = [`${pathBase}.jsonc`, `${pathBase}.json`];
  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const clean = stripJsonComments(text);
      return JSON.parse(clean);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Failed to fetch index');
}

export async function loadPlayersIndex() {
  try {
    const json = await fetchIndexWithComments('/models/players/index');
    const list = Array.isArray(json.players) ? json.players : [];
    // Map to normalized entries; keep stubs for UI (disabled)
    const players = list
      .map(p => {
        const name = (p && p.name != null) ? String(p.name).trim() : '';
        if (!name) return null;
        const skins = Array.isArray(p.skins) && p.skins.length
          ? p.skins.map(s => String(s).trim()).filter(Boolean)
          : ['default'];
        return {
          name,
          skins,
          hasVariants: !!p.hasVariants,
          stub: !!p.stub || !!p.disabled, // treat disabled as stub
          notes: typeof p.notes === 'string' ? p.notes : ''
        };
      })
      .filter(Boolean);
    return players;
  } catch (e) {
    // No fallback to idsoftware defaults; keep empty so UI selects "NO PLAYER"
    console.info('Players index missing or invalid; running with no players.', e);
    return [];
  }
}

export async function loadWeaponsIndex() {
  try {
    const json = await fetchIndexWithComments('/models/weapons/index');
    const list = Array.isArray(json.weapons) ? json.weapons : [];
    const weapons = list
      .map(w => {
        const name = (w && w.name != null) ? String(w.name).trim() : '';
        if (!name) return null;
        return {
          name,
          hasVariants: !!w.hasVariants,
          stub: !!w.stub || !!w.disabled,
          notes: typeof w.notes === 'string' ? w.notes : ''
        };
      })
      .filter(Boolean);
    return weapons;
  } catch (e) {
    console.info('Weapons index missing or invalid; only "UNARMED" will be available.', e);
    return [];
  }
}

export function getPlayerInfo(players, name) {
  if (!Array.isArray(players) || !name || name === 'none') return null;
  return players.find(p => p.name === name) || null;
}

export function getWeaponInfo(weapons, name) {
  if (!Array.isArray(weapons) || !name || name === 'none') return null;
  return weapons.find(w => w.name === name) || null;
}