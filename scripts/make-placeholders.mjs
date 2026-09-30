// Genera imágenes ilustrativas por categoría para los datos de demostración.
import { mkdirSync, writeFileSync } from "node:fs";

const ink = "#2a3039";
const accent = "#ff6124";
const shapes = {
  frenos: `<circle cx="400" cy="400" r="210" fill="none" stroke="${ink}" stroke-width="34"/><circle cx="400" cy="400" r="70" fill="none" stroke="${ink}" stroke-width="28"/><g fill="${ink}"><circle cx="400" cy="265" r="16"/><circle cx="535" cy="400" r="16"/><circle cx="400" cy="535" r="16"/><circle cx="265" cy="400" r="16"/></g><path d="M560 250 a230 230 0 0 1 60 150" stroke="${accent}" stroke-width="56" fill="none" stroke-linecap="round"/>`,
  filtros: `<rect x="270" y="210" width="260" height="380" rx="40" fill="none" stroke="${ink}" stroke-width="30"/><g stroke="${ink}" stroke-width="18"><line x1="320" y1="260" x2="320" y2="540"/><line x1="370" y1="260" x2="370" y2="540"/><line x1="420" y1="260" x2="420" y2="540"/><line x1="470" y1="260" x2="470" y2="540"/></g><rect x="300" y="160" width="200" height="50" rx="14" fill="${accent}"/>`,
  suspension: `<line x1="400" y1="150" x2="400" y2="650" stroke="${ink}" stroke-width="30" stroke-linecap="round"/><path d="M320 250 L480 290 L320 330 L480 370 L320 410 L480 450 L320 490 L480 530" fill="none" stroke="${accent}" stroke-width="26" stroke-linejoin="round"/><rect x="330" y="560" width="140" height="70" rx="16" fill="${ink}"/>`,
  encendido: `<rect x="355" y="140" width="90" height="120" rx="18" fill="${ink}"/><rect x="325" y="260" width="150" height="150" rx="20" fill="none" stroke="${ink}" stroke-width="28"/><rect x="370" y="410" width="60" height="140" fill="${ink}"/><path d="M400 560 L400 620 M380 640 L420 640" stroke="${ink}" stroke-width="18"/><path d="M470 560 l40 -30 -10 40 45 -20" fill="none" stroke="${accent}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`,
  electrico: `<rect x="200" y="280" width="400" height="280" rx="30" fill="none" stroke="${ink}" stroke-width="30"/><rect x="260" y="230" width="70" height="50" rx="8" fill="${ink}"/><rect x="470" y="230" width="70" height="50" rx="8" fill="${ink}"/><path d="M420 330 L360 430 L420 430 L380 520" fill="none" stroke="${accent}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>`,
  lubricantes: `<path d="M400 170 C 470 290 540 360 540 460 A140 140 0 0 1 260 460 C 260 360 330 290 400 170 Z" fill="none" stroke="${ink}" stroke-width="30" stroke-linejoin="round"/><path d="M340 470 A70 70 0 0 0 400 530" fill="none" stroke="${accent}" stroke-width="26" stroke-linecap="round"/>`,
  motor: `<circle cx="400" cy="400" r="120" fill="none" stroke="${ink}" stroke-width="30"/><circle cx="400" cy="400" r="40" fill="${accent}"/><g stroke="${ink}" stroke-width="44" stroke-linecap="round"><line x1="400" y1="215" x2="400" y2="250"/><line x1="400" y1="550" x2="400" y2="585"/><line x1="215" y1="400" x2="250" y2="400"/><line x1="550" y1="400" x2="585" y2="400"/><line x1="270" y1="270" x2="295" y2="295"/><line x1="505" y1="505" x2="530" y2="530"/><line x1="530" y1="270" x2="505" y2="295"/><line x1="270" y1="530" x2="295" y2="505"/></g>`,
  embrague: `<circle cx="400" cy="400" r="210" fill="none" stroke="${ink}" stroke-width="30"/><circle cx="400" cy="400" r="130" fill="none" stroke="${accent}" stroke-width="26" stroke-dasharray="40 22"/><circle cx="400" cy="400" r="50" fill="${ink}"/>`,
};

const dir = new URL("../public/placeholders/", import.meta.url);
mkdirSync(dir, { recursive: true });
for (const [name, body] of Object.entries(shapes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f7f9"/><stop offset="1" stop-color="#e3e7ec"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/>${body}</svg>`;
  writeFileSync(new URL(`${name}.svg`, dir), svg);
}
console.log("Imágenes generadas:", Object.keys(shapes).join(", "));
