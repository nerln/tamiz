// Piccoli aiuti per costruire il DOM senza innerHTML (niente testo del catalogo interpretato come HTML).

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
  if (typeof testo !== "string" || !/2099/.test(testo)) return testo;
  let t = testo.replace(/,?\s*y el \d{1,2}\/\d{1,2}\/2099 es solo un tope t[ée]cnico/gi, "");
  if (/2099/.test(t)) t = t.replace(/\s*[^.]*2099[^.]*(?:\.|$)/g, "");
  return t.replace(/\s{2,}/g, " ").trim();
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
