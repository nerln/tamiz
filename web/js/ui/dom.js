// Piccoli aiuti per costruire il DOM senza innerHTML (niente testo del catalogo interpretato come HTML).

import { t } from "../i18n.js";

let seq = 0;
export const nuovoId = (base) => `${base}-${++seq}`;

// el("p", { class: "x", for: "a", onclick: fn, disabled: true }, "testo", nodo, [nodi])
export function el(tag, attrs = {}, ...figli) {
  const nodo = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") nodo.addEventListener(k.slice(2), v);
    else if (k === "text") nodo.textContent = String(v);
    else if (v === true) nodo.setAttribute(k, "");
    else nodo.setAttribute(k, String(v));
  }
  const aggiungi = (x) => {
    if (x === undefined || x === null || x === false) return;
    if (Array.isArray(x)) x.forEach(aggiungi);
    else if (x instanceof Node) nodo.appendChild(x);
    else nodo.appendChild(document.createTextNode(String(x)));
  };
  figli.forEach(aggiungi);
  return nodo;
}

// Data locale del browser, AAAA-MM-DD.
export function oggi() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function giorniTra(da, a) {
  const [y1, m1, d1] = da.split("-").map(Number);
  const [y2, m2, d2] = a.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function sumaGiorni(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

const MESI = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];

// «12 de noviembre de 2026», da una data AAAA-MM-DD. Testo fisso in spagnolo.
export function fechaLarga(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESI[m - 1]} de ${y}`;
}

// Dal 2099 in poi una data di fine è un tetto tecnico del calcolo (per esempio la RVI, senza scadenza vera):
// non è una scadenza e non si mostra mai.
export function esFinTecnico(iso) {
  return typeof iso === "string" && /^\d{4}/.test(iso) && Number(iso.slice(0, 4)) >= 2099;
}

// Un testo del catalogo che nomina il tetto tecnico: via la frase «y el 31/12/2099 es solo un tope técnico»,
// e le frasi che restano con un 2099 escono intere. Nessun testo esce con una data 2099.
export function sinFinTecnico(testo) {
  if (typeof testo !== "string") return testo;
  // In inglese il testo si traduce prima, e solo poi si toglie la frase del tetto tecnico (punto 4).
  const tr = t(testo);
  if (!/2099/.test(tr)) return tr;
  let x = tr.replace(/,?\s*y el \d{1,2}\/\d{1,2}\/2099 es solo un tope t[ée]cnico/gi, "")
    .replace(/,?\s*and (?:the )?\d{1,2}\/\d{1,2}\/2099 is only a technical cap/gi, "");
  if (/2099/.test(x)) x = x.replace(/\s*[^.]*2099[^.]*(?:\.|$)/g, "");
  return x.replace(/\s{2,}/g, " ").trim();
}

// Passa su tutti i testi di un nodo già costruito e toglie le date 2099 (ultima rete, dopo la costruzione).
export function sinFinTecnicoEn(nodo) {
  const cammina = document.createTreeWalker(nodo, NodeFilter.SHOW_TEXT);
  const testi = [];
  while (cammina.nextNode()) testi.push(cammina.currentNode);
  for (const t of testi) {
    const nuovo = sinFinTecnico(t.textContent);
    if (nuovo === t.textContent) continue;
    t.textContent = nuovo;
    // Una voce di elenco che resta senza testo esce per intero (per esempio la RVI, se la sua frase era solo il tetto).
    const voce = t.parentNode;
    if (voce && voce.tagName === "LI" && voce.textContent.trim() === "") voce.remove();
  }
  return nodo;
}

// Le aree del catalogo (campo `area` della scheda), nell'ordine in cui si mostrano. Etichette in spagnolo.
export const AREAS = [
  ["familia", "Familia"], ["vivienda", "Vivienda"], ["empleo", "Empleo"], ["estudios", "Estudios"],
  ["investigacion", "Investigación"], ["impuestos", "Impuestos"], ["salud_cuidados", "Salud y cuidados"],
  ["extranjeria", "Extranjería"], ["emprender", "Emprender"], ["jovenes_ocio", "Jóvenes y ocio"],
  ["servicios_sociales", "Servicios sociales"], ["empleo_publico", "Empleo público"],
];
const NOMBRE_AREA = new Map(AREAS);
// Una scheda senza area (catalogo precedente a L20) finisce in «Otras», in fondo.
export const SIN_AREA = "otras";
export const areaValida = (a) => (NOMBRE_AREA.has(a) ? a : SIN_AREA);
export const nombreArea = (a) => NOMBRE_AREA.get(a) || "Otras";
export const ordenArea = (a) => { const i = AREAS.findIndex(([k]) => k === a); return i < 0 ? AREAS.length : i; };

// Il simbolo di Tamiz (la T che accoglie) come SVG in linea: i colori vengono dal CSS, così cambia con il tema.
// È decorativo: chi lo usa mette accanto il nome in testo.
const NS = "http://www.w3.org/2000/svg";
export function simbolo(clase = "simbolo") {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 64 64");
  s.setAttribute("class", clase);
  s.setAttribute("aria-hidden", "true");
  s.setAttribute("focusable", "false");
  const parte = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    s.appendChild(n);
  };
  parte("circle", { class: "simbolo-cabeza", cx: "32", cy: "11", r: "7.6" });
  parte("path", { class: "simbolo-brazos", d: "M5 21 C9.5 25.5 18 27 32 27 C46 27 54.5 25.5 59 21" });
  parte("path", { class: "simbolo-cuerpo", d: "M26.75 27 H37.25 L36.5 57.5 A4.5 4.5 0 0 1 27.5 57.5 Z" });
  return s;
}
