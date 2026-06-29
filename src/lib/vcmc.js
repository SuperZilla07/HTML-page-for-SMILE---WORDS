export const LETTER_MAP = {
  A: "N",
  E: "O",
  I: "N(C)",
  O: "S",
  U: "C(=O)",
  B: "[C@@H]",
  C: "[C@H]",
  D: "[C@@H](F)",
  F: "[C@H](F)",
  G: "[C@@H](Cl)",
  H: "[C@H](Cl)",
  J: "[C@@H](Br)",
  K: "[C@H](Br)",
  L: "[C@@H](O)",
  M: "[C@H](O)",
  V: "[C@@H](S)",
  W: "[C@H](S)",
  N: "[C@@H](N)",
  P: "[C@H](N)",
  Q: "[C@@H](C)",
  R: "[C@H](C)",
  S: "[C@@H](CC)",
  T: "[C@H](CC)",
  X: "[C@@H](C#N)",
  Y: "[C@H](C#N)",
  Z: "[C@@H](I)"
};

export const VOWELS = new Set(["A", "E", "I", "O", "U"]);

const REVERSE_MAP = Object.fromEntries(
  Object.entries(LETTER_MAP).map(([letter, token]) => [token, letter])
);

const TOKEN_ORDER = [
  "[C@@H](C#N)", "[C@H](C#N)",
  "[C@@H](CC)", "[C@H](CC)",
  "[C@@H](Cl)", "[C@H](Cl)",
  "[C@@H](Br)", "[C@H](Br)",
  "[C@@H](F)", "[C@H](F)",
  "[C@@H](O)", "[C@H](O)",
  "[C@@H](S)", "[C@H](S)",
  "[C@@H](N)", "[C@H](N)",
  "[C@@H](C)", "[C@H](C)",
  "[C@@H](I)", "[C@H](I)",
  "[C@@H]", "[C@H]",
  "N(C)", "C(=O)",
  "N", "O", "S"
];

export function wordsFromInput(text) {
  return text
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z]/g, "").toUpperCase())
    .filter(Boolean);
}

export function encodeWord(word) {
  const letters = Array.from(word.toUpperCase()).filter((letter) => LETTER_MAP[letter]);
  if (!letters.length) return null;
  const tokens = letters.map((letter) => LETTER_MAP[letter]);
  const ring = letters.length >= 5;
  const smiles = tokens[0] + (ring ? "1" : "") + tokens.slice(1).join("") + (ring ? "1" : "");
  return {
    ring,
    smiles,
    tokenCount: tokens.length
  };
}

export function encodeText(text) {
  return wordsFromInput(text)
    .map(encodeWord)
    .filter(Boolean);
}

function normalizeForDecode(smiles) {
  return String(smiles).trim().replace(/([A-Za-z\]])\d/g, "$1");
}

export function tokenizeSmiles(smiles) {
  const raw = normalizeForDecode(smiles);
  const tokens = [];
  let i = 0;
  while (i < raw.length) {
    let matched = "";
    for (const token of TOKEN_ORDER) {
      if (raw.startsWith(token, i)) {
        matched = token;
        break;
      }
    }
    if (matched) {
      tokens.push(matched);
      i += matched.length;
    } else {
      i += 1;
    }
  }
  return tokens;
}

export function decodeSmiles(smiles) {
  return tokenizeSmiles(smiles)
    .map((token) => REVERSE_MAP[token])
    .filter(Boolean)
    .join("");
}

export function decodeMessage(encodedWords = []) {
  return encodedWords
    .map((entry) => decodeSmiles(entry.smiles))
    .filter(Boolean)
    .join(" ");
}

export function displaySmilesForRendering(smiles) {
  return String(smiles)
    .replace(/\[C@@H\]/g, "C")
    .replace(/\[C@H\]/g, "C");
}

export function pubChemImageUrl(smiles) {
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/${encodeURIComponent(displaySmilesForRendering(smiles))}/PNG?image_size=large`;
}

export function cactusImageUrl(smiles) {
  return `https://cactus.nci.nih.gov/chemical/structure/${encodeURIComponent(displaySmilesForRendering(smiles))}/image`;
}

export function makeLocalStructureSvg(encodedWord, width = 220, height = 172) {
  const tokens = tokenizeSmiles(encodedWord.smiles);
  const ring = encodedWord.ring || /\d/.test(encodedWord.smiles);
  const points = pointsForMolecule(tokens, ring, width, height);
  const bond = (a, b) => `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#cfd5ff" stroke-width="2" stroke-linecap="round"/>`;
  let svg = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<rect width="${width}" height="${height}" rx="14" fill="#ffffff"/>`;
  for (let i = 0; i < points.length - 1; i++) svg += bond(points[i], points[i + 1]);
  if (ring && points.length > 2) svg += bond(points[points.length - 1], points[0]);
  tokens.forEach((token, index) => {
    const point = points[index];
    const atom = atomForToken(token);
    const color = atom === "N" ? "#2477ff" : atom === "O" ? "#ef233c" : atom === "S" ? "#c0a000" : "#111827";
    svg += `<circle cx="${point.x}" cy="${point.y}" r="${atom === "C" ? 5 : 11}" fill="${atom === "C" ? color : "#fff"}" stroke="${color}" stroke-width="1.5"/>`;
    if (atom !== "C") svg += `<text x="${point.x}" y="${point.y + 1}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-family="Arial" font-weight="700" fill="${color}">${atom}</text>`;
  });
  svg += "</svg>";
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function atomForToken(token) {
  if (token === "N" || token === "N(C)") return "N";
  if (token === "O" || token === "C(=O)") return "O";
  if (token === "S") return "S";
  return "C";
}

function pointsForMolecule(tokens, ring, width, height) {
  if (!tokens.length) return [];
  if (ring) {
    const radius = Math.min(width, height) * 0.27;
    const cx = width / 2;
    const cy = height / 2;
    return tokens.map((_, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / tokens.length;
      return {
        x: Number((cx + radius * Math.cos(angle)).toFixed(1)),
        y: Number((cy + radius * Math.sin(angle)).toFixed(1))
      };
    });
  }
  const step = Math.min(44, (width - 56) / Math.max(tokens.length - 1, 1));
  const startX = width / 2 - (step * (tokens.length - 1)) / 2;
  return tokens.map((_, index) => ({
    x: Number((startX + index * step).toFixed(1)),
    y: Number((height / 2 + (index % 2 ? 16 : -16)).toFixed(1))
  }));
}
