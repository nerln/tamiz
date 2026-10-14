// La pantalla de las preguntas: una pantalla por vez, atrás sin perder nada, «no lo sé» siempre.
import { el, nuovoId } from "./dom.js";
import { PANTALLAS, PAISES, TRAMOS, controlesVisibles, pantallasVisibles, escribir, leer, tramoDeImporte, esValencia } from "../preguntas.js";

// Il comune «No lo sé» non ha un codice nello schema (docs/ESQUEMA.md §2.5): si ricorda sull'oggetto residencia
// salvato, come il reddito con PREFIERO_INGRESO. Se residencia cambia oggetto (cioè si riscrive), il ricordo cade.
const MUNICIPIO_NO_SE = new WeakSet();
export function municipioNoSabe(perfil) {
  const r = leer(perfil, "residencia");
  return !!r && typeof r === "object" && MUNICIPIO_NO_SE.has(r);
}

const SIN_VALOR = "__vacio__";
// «Prefiero no decirlo» per un reddito si salva come «no lo sé» (docs/ESQUEMA.md §2.5): lo schema non ha un altro
// codice. Per ricordare la scelta al ritorno si tiene l'oggetto del reddito così salvato. Se il reddito cambia,
// l'oggetto cambia (escribir ne crea uno nuovo) e il ricordo cade da solo: nel profilo non entra nulla di nuovo.
const PREFIERO_INGRESO = new WeakSet();
export function prefieroNoDecirloIngreso(obj) {
  return !!obj && typeof obj === "object" && PREFIERO_INGRESO.has(obj);
}
const RE_FECHA = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

// Inizio e fine di una data parziale, o null se non valida (§3.1).
function extremosFecha(texto) {
  const m = RE_FECHA.exec(texto);
  if (!m) return null;
  const y = +m[1];
  const ultimo = (mo) => new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (m[2] === undefined) return { prima: `${y}-01-01`, ultima: `${y}-12-31` };
  const mo = +m[2];
  if (mo < 1 || mo > 12) return null;
  if (m[3] === undefined) return { prima: `${y}-${m[2]}-01`, ultima: `${y}-${m[2]}-${String(ultimo(mo)).padStart(2, "0")}` };
  const d = +m[3];
  if (d < 1 || d > ultimo(mo)) return null;
  return { prima: texto, ultima: texto };
}

// Un controllo: { nodo, leer() -> {ok, escrituras:[[ruta, valor]]} | {ok:false, error}, borrador() -> [[ruta, valor]] }.
// Il controllo non sa niente del profilo: lo sa solo la pantalla.
function controlloNumero(c, previo, hoy) {
  const chk = el("input", { type: "checkbox", id: nuovoId("nls") });
  const campo = el("input", { type: "number", inputmode: "numeric", min: c.min, max: c.max, id: nuovoId("n"),
    "aria-label": c.etiqueta });
  if (typeof previo === "number") campo.value = String(previo);
  chk.checked = previo === "no_lo_se";
  campo.disabled = chk.checked;
  chk.addEventListener("change", () => { campo.disabled = chk.checked; });
  const nodo = el("div", { class: "fila" },
    el("label", { class: "campo-etiqueta", for: campo.id, text: c.etiqueta }), campo,
    el("label", { class: "nls" }, chk, " No lo sé"));
  const valorDi = () => {
    if (chk.checked) return "no_lo_se";
    if (campo.value === "") return undefined;
    const v = Number(campo.value);
    return Number.isInteger(v) && v >= c.min && v <= c.max ? v : undefined;
  };
  return {
    nodo, nombre: campo,
    leer() {
      if (chk.checked) return { ok: true, escrituras: [[c.campo, "no_lo_se"]] };
      if (campo.value === "") return { ok: false, error: `${c.etiqueta}: escribe un número o marca «No lo sé».` };
      const v = valorDi();
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: escribe un número entre ${c.min} y ${c.max}.` };
      return { ok: true, escrituras: [[c.campo, v]] };
    },
    borrador: () => (valorDi() === undefined ? [] : [[c.campo, valorDi()]]),
  };
}

function controlloFecha(c, previo, hoy) {
  const campo = el("input", { type: "text", inputmode: "numeric", placeholder: "AAAA o AAAA-MM", id: nuovoId("f"),
    "aria-label": c.etiqueta, autocomplete: "off" });
  const chk = el("input", { type: "checkbox", id: nuovoId("nls") });
  if (typeof previo === "string" && previo !== "no_lo_se") campo.value = previo;
  chk.checked = previo === "no_lo_se";
  campo.disabled = chk.checked;
  chk.addEventListener("change", () => { campo.disabled = chk.checked; });
  const nodo = el("div", { class: "fila" },
    el("label", { class: "campo-etiqueta", for: campo.id, text: c.etiqueta }), campo,
    el("p", { class: "ayuda", text: "Ejemplos: 2019 o 2019-06." }),
    el("label", { class: "nls" }, chk, " No lo sé"));
  const valorDi = () => {
    if (chk.checked) return "no_lo_se";
    const e = extremosFecha(campo.value.trim());
    if (!e) return undefined;
    if (!c.futuro && e.prima > hoy) return undefined;
    return campo.value.trim();
  };
  return {
    nodo, nombre: campo,
    leer() {
      if (chk.checked) return { ok: true, escrituras: [[c.campo, "no_lo_se"]] };
      const t = campo.value.trim();
      if (t === "") return { ok: false, error: `${c.etiqueta}: escribe una fecha o marca «No lo sé».` };
      if (valorDi() === undefined) return { ok: false, error: `${c.etiqueta}: la fecha no es válida${c.futuro ? "" : " o está en el futuro"}. Usa AAAA, AAAA-MM o AAAA-MM-DD.` };
      return { ok: true, escrituras: [[c.campo, t]] };
    },
    borrador: () => (valorDi() === undefined ? [] : [[c.campo, valorDi()]]),
  };
}

function controlloTexto(c, previo) {
  const campo = el("input", { type: "text", inputmode: "numeric", id: nuovoId("t"), "aria-label": c.etiqueta, maxlength: 5 });
  const chk = el("input", { type: "checkbox", id: nuovoId("nls") });
  if (typeof previo === "string" && previo !== "no_lo_se") campo.value = previo;
  chk.checked = previo === "no_lo_se";
  campo.disabled = chk.checked;
  chk.addEventListener("change", () => { campo.disabled = chk.checked; });
  const nodo = el("div", { class: "fila" },
    el("label", { class: "campo-etiqueta", for: campo.id, text: c.etiqueta }), campo,
    el("label", { class: "nls" }, chk, " No lo sé"));
  const valorDi = () => (chk.checked ? "no_lo_se" : c.patron.test(campo.value.trim()) ? campo.value.trim() : undefined);
  return {
    nodo, nombre: campo,
    leer() {
      const v = valorDi();
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: ${c.error || "revisa el dato"}, o marca «No lo sé».` };
      return { ok: true, escrituras: [[c.campo, v]] };
    },
    borrador: () => (valorDi() === undefined ? [] : [[c.campo, valorDi()]]),
  };
}

// Menu a tendina con «Elige una opción» e «No lo sé» dentro le opzioni del catalogo. Con opciones_de le opzioni dipendono
// dalla bozza (la provincia segue la comunità): actualiza() le riscrive e tiene la scelta, se è ancora fra le opzioni.
function controlloSelect(c, previo, _hoy, perfil) {
  const select = el("select", { id: nuovoId("s"), "aria-label": c.etiqueta });
  const pinta = (lista) => {
    const scelta = select.value;
    select.replaceChildren(el("option", { value: "", text: "Elige una opción" }),
      ...lista.map(([codigo, texto]) => el("option", { value: String(codigo), text: texto })));
    select.value = lista.some(([codigo]) => String(codigo) === scelta) ? scelta : "";
  };
  pinta(c.opciones_de ? c.opciones_de(perfil) : c.opciones);
  if (previo !== undefined && previo !== null) select.value = String(previo);
  const leerValor = () => {
    if (select.value === "") return undefined;
    const raw = select.value;
    return /^\d+$/.test(raw) && c.campo.endsWith("mes_nacimiento") ? Number(raw) : raw;
  };
  const nodo = el("div", { class: "fila" }, el("label", { class: "campo-etiqueta", for: select.id, text: c.etiqueta }), select);
  return {
    nodo, nombre: select,
    actualiza(b) { if (c.opciones_de) pinta(c.opciones_de(b)); },
    leer() {
      const v = leerValor();
      if (v === undefined && c.opcional) return { ok: true, escrituras: [[c.campo, undefined]] };
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: elige una opción.` };
      return { ok: true, escrituras: [[c.campo, v]] };
    },
    borrador: () => (leerValor() === undefined ? [] : [[c.campo, leerValor()]]),
  };
}

// Comune in testo libero, con il suggerimento «València». «No lo sé» lascia il campo vuoto (vedi MUNICIPIO_NO_SE).
// Il codice INE (c.ine) si scrive da sé solo per la ciudad de València (c.provincia_de: ES-V o non ancora scelta).
// Se il comune scritto è un altro, il codice si chiede nel campo INE, e un codice 46250 già salvato resta lì.
function controlloMunicipio(c, previo) {
  const idLista = nuovoId("dl");
  const campo = el("input", { type: "text", id: nuovoId("m"), "aria-label": c.etiqueta, maxlength: 80, autocomplete: "off",
    list: idLista, placeholder: c.sugerencia });
  const chk = el("input", { type: "checkbox", id: nuovoId("nls") });
  if (typeof previo === "string" && previo !== "no_lo_se") campo.value = previo;
  chk.checked = c.recuerda_no_se === true && (previo === undefined || previo === null);
  if (chk.checked) campo.value = "";
  campo.disabled = chk.checked;
  chk.addEventListener("change", () => {
    if (chk.checked) campo.value = "";
    campo.disabled = chk.checked;
  });
  const nodo = el("div", { class: "fila" },
    el("label", { class: "campo-etiqueta", for: campo.id, text: c.etiqueta }), campo,
    el("datalist", { id: idLista }, el("option", { value: c.sugerencia })),
    el("p", { class: "ayuda", text: `Escribe el nombre del municipio. Por ejemplo: ${c.sugerencia}.` }),
    el("label", { class: "nls" }, chk, " No lo sé"));
  const valorDi = () => (chk.checked ? undefined : (campo.value.trim() || undefined));
  const escrituras = (t) => {
    const esc = [[c.campo, t]];
    const provincia = c.provincia_de ? c.provincia_de() : undefined;
    const derivable = provincia === undefined || provincia === "ES-V";
    if (t !== undefined && esValencia(t) && derivable) esc.push([c.ine, "46250"]);
    else if (t !== undefined && c.ine_previo === "46250") esc.push([c.ine, undefined]);
    return esc;
  };
  return {
    nodo, nombre: campo,
    leer() {
      const t = valorDi();
      if (t === undefined && !chk.checked) return { ok: false, error: `${c.etiqueta}: escribe el nombre del municipio o marca «No lo sé».` };
      return { ok: true, escrituras: escrituras(t) };
    },
    borrador: () => escrituras(valorDi()),
    noSabe: () => chk.checked,
  };
}

// Pulsanti radio con etichette. Il codice null (Otra situación) cancella il campo.
function controlloRadio(c, previo, pantalla) {
  const nome = nuovoId("r");
  const righe = c.opciones.map(([codigo, texto]) => {
    const valore = codigo === null ? SIN_VALOR : codigo;
    const input = el("input", { type: "radio", name: nome, value: valore, id: nuovoId("ro") });
    const previoVal = previo === null ? SIN_VALOR : previo;
    if (previo !== undefined && previoVal === valore) input.checked = true;
    return { input, codigo, nodo: el("label", { class: "opcion" }, input, texto) };
  });
  const ayuda = el("div", { class: "ayuda-ong", hidden: true });
  const cambio = () => {
    const sel = righe.find((r) => r.input.checked);
    if (c.ong_si_otro) ayuda.hidden = !(sel && sel.codigo === null);
    if (c.ong_si_otro) pintaOng(ayuda, c.ongs);
  };
  righe.forEach((r) => r.input.addEventListener("change", cambio));
  const nodo = el("fieldset", { class: "grupo" }, el("legend", { class: "campo-etiqueta", text: c.etiqueta }),
    righe.map((r) => r.nodo), ayuda);
  cambio();
  const valorDi = () => {
    const sel = righe.find((r) => r.input.checked);
    return sel ? { codigo: sel.codigo } : undefined;
  };
  // Scritture che la scelta porta con sé (c.extra), per esempio il permesso di lavoro di un documento.
  const conExtra = (codigo) => [[c.campo, codigo], ...(c.extra ? c.extra(codigo) : [])];
  return {
    nodo, nombre: righe[0].input,
    leer() {
      const sel = valorDi();
      if (!sel) return { ok: false, error: `${c.etiqueta}: elige una opción.` };
      if (c.radio_pais_otro && sel.codigo === "otro") return { ok: true, escrituras: [] };
      return { ok: true, escrituras: conExtra(sel.codigo) };
    },
    borrador() {
      const sel = valorDi();
      if (!sel) return [];
      return conExtra(sel.codigo);
    },
  };
}

function pintaOng(nodo, ongs) {
  nodo.replaceChildren();
  nodo.append("Si no te reconoces en ninguna opción, puedes pedir orientación gratuita ");
  if (ongs.length) {
    nodo.append("en: " + ongs.map((o) => o.nombre).join(", ") + ". ");
  } else {
    nodo.append("en la sección de ayuda humana. ");
  }
  nodo.append(el("a", { href: "#ayuda", text: "Ver la ayuda humana" }));
  nodo.append(" ");
  nodo.append("Deja el campo vacío si prefieres no decirlo.");
}

function controlloBool(c, previo) {
  const nome = nuovoId("b");
  const op = [["true", "Sí"], ["false", "No"], ["no_lo_se", "No lo sé"]];
  const inputs = op.map(([v, t]) => {
    const input = el("input", { type: "radio", name: nome, value: v, id: nuovoId("bo") });
    if (previo !== undefined && String(previo) === v) input.checked = true;
    return { input, nodo: el("label", { class: "opcion" }, input, t), v };
  });
  const nodo = el("fieldset", { class: "grupo" }, el("legend", { class: "campo-etiqueta", text: c.etiqueta }), inputs.map((x) => x.nodo));
  const valorDi = () => {
    const s = inputs.find((x) => x.input.checked);
    if (!s) return undefined;
    return s.v === "no_lo_se" ? "no_lo_se" : s.v === "true";
  };
  return {
    nodo, nombre: inputs[0].input,
    leer() {
      const v = valorDi();
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: elige Sí, No o «No lo sé».` };
      return { ok: true, escrituras: [[c.campo, v]] };
    },
    borrador: () => (valorDi() === undefined ? [] : [[c.campo, valorDi()]]),
  };
}

// Caselle multiple per liste di codici. «no lo sé» e l'opzione «nadie» sono esclusive.
function controlloLista(c, previo) {
  const righe = c.opciones.filter(([v]) => v !== "no_lo_se").map(([codigo, texto]) => {
    const input = el("input", { type: "checkbox", id: nuovoId("lo"), value: codigo });
    if (Array.isArray(previo) && previo.includes(codigo)) input.checked = true;
    return { input, codigo, nodo: el("label", { class: "opcion" }, input, texto) };
  });
  const nls = el("input", { type: "checkbox", id: nuovoId("lnls") });
  nls.checked = previo === "no_lo_se";
  const nadieRiga = c.nadie ? (() => {
    const input = el("input", { type: "checkbox", id: nuovoId("nadie") });
    input.checked = Array.isArray(previo) && previo.length === 0;
    return { input, nodo: el("label", { class: "opcion" }, input, c.nadie[1]) };
  })() : null;
  const todas = [...righe.map((r) => r.input), nls, nadieRiga?.input].filter(Boolean);
  const esclusiva = (sorgente) => {
    if (sorgente.checked && (sorgente === nls || sorgente === nadieRiga?.input)) {
      for (const x of todas) if (x !== sorgente) x.checked = false;
    } else if (sorgente.checked) {
      nls.checked = false;
      if (nadieRiga) nadieRiga.input.checked = false;
    }
  };
  todas.forEach((x) => x.addEventListener("change", () => esclusiva(x)));
  const nodo = el("fieldset", { class: "grupo" }, el("legend", { class: "campo-etiqueta", text: c.etiqueta }),
    righe.map((r) => r.nodo), nadieRiga ? nadieRiga.nodo : null,
    el("label", { class: "opcion" }, nls, " No lo sé"));
  const leerDi = () => {
    if (nls.checked) return "no_lo_se";
    if (nadieRiga && nadieRiga.input.checked) return [];
    const marcati = righe.filter((r) => r.input.checked).map((r) => r.codigo);
    return marcati.length ? marcati : undefined;
  };
  return {
    nodo, nombre: righe[0]?.input || nls,
    leer() {
      const v = leerDi();
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: marca al menos una opción.` };
      return { ok: true, escrituras: [[c.campo, v]] };
    },
    borrador: () => (leerDi() === undefined ? [] : [[c.campo, leerDi()]]),
  };
}

// Lista di paesi (chip) con un menu per aggiungere.
function controlloPaises(c, previo) {
  let lista = Array.isArray(previo) ? [...previo] : [];
  const nls = el("input", { type: "checkbox", id: nuovoId("pnls") });
  nls.checked = previo === "no_lo_se";
  const nadie = c.nadie ? el("input", { type: "checkbox", id: nuovoId("pnad") }) : null;
  if (nadie) nadie.checked = Array.isArray(previo) && previo.length === 0;
  const menu = el("select", { id: nuovoId("pm"), "aria-label": `Añadir a ${c.etiqueta.toLowerCase()}` },
    el("option", { value: "", text: "Elige un país" }),
    PAISES.map(([k, t]) => el("option", { value: k, text: t })));
  const chips = el("ul", { class: "chips" });
  const pinta = () => {
    chips.replaceChildren(...lista.map((k) => {
      const nombre = (PAISES.find((p) => p[0] === k) || [k, k])[1];
      return el("li", { class: "chip" }, nombre,
        el("button", { type: "button", class: "quitar", onclick: () => { lista = lista.filter((x) => x !== k); pinta(); },
          "aria-label": `Quitar ${nombre}`, text: "×" }));
    }));
  };
  const aggiungi = el("button", { type: "button", class: "secundario", text: "Añadir país",
    onclick: () => {
      if (!menu.value) return;
      if (!lista.includes(menu.value)) lista.push(menu.value);
      nls.checked = false;
      if (nadie) nadie.checked = false;
      menu.value = "";
      pinta();
    } });
  nls.addEventListener("change", () => { if (nls.checked) { lista = []; if (nadie) nadie.checked = false; pinta(); } });
  if (nadie) nadie.addEventListener("change", () => { if (nadie.checked) { lista = []; nls.checked = false; pinta(); } });
  pinta();
  const nodo = el("div", { class: "fila" },
    el("span", { class: "campo-etiqueta", text: c.etiqueta }),
    chips,
    el("div", { class: "fila-linea" }, menu, aggiungi),
    nadie ? el("label", { class: "opcion" }, nadie, " " + c.nadie[1]) : null,
    el("label", { class: "nls" }, nls, " No lo sé"));
  const leerDi = () => {
    if (nls.checked) return "no_lo_se";
    if (nadie && nadie.checked) return [];
    return lista.length ? [...lista] : undefined;
  };
  return {
    nodo, nombre: menu,
    leer() {
      const v = leerDi();
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: añade un país, marca «${c.nadie ? c.nadie[1] : "No lo sé"}» o «No lo sé».` };
      return { ok: true, escrituras: [[c.campo, v]] };
    },
    borrador: () => (leerDi() === undefined ? [] : [[c.campo, leerDi()]]),
  };
}

// Un solo paese, con «No lo sé» (menu).
function controlloPais(c, previo) {
  const menu = el("select", { id: nuovoId("pm1"), "aria-label": c.etiqueta },
    el("option", { value: "", text: "Elige un país" }),
    PAISES.map(([k, t]) => el("option", { value: k, text: t })),
    el("option", { value: "no_lo_se", text: "No lo sé" }));
  if (typeof previo === "string") menu.value = previo;
  const nodo = el("div", { class: "fila" }, el("label", { class: "campo-etiqueta", for: menu.id, text: c.etiqueta }), menu);
  const leerDi = () => (menu.value ? menu.value : undefined);
  return {
    nodo, nombre: menu,
    leer() {
      const v = leerDi();
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: elige un país o «No lo sé».` };
      return { ok: true, escrituras: [[c.campo, v]] };
    },
    borrador: () => (leerDi() === undefined ? [] : [[c.campo, leerDi()]]),
  };
}

// Ingresso in tramo, con cifra facoltativa: se c'è la cifra, il tramo si ricava da lei.
function controlloTramo(c, previo) {
  const tramoSel = el("select", { id: nuovoId("tr"), "aria-label": `${c.etiqueta}, tramo` },
    el("option", { value: "", text: "Elige un tramo" }),
    TRAMOS.map(([k, t]) => el("option", { value: k, text: t })),
    el("option", { value: "no_lo_se", text: "No lo sé" }),
    el("option", { value: "prefiero_no_decirlo", text: "Prefiero no decirlo" }));
  const importe = el("input", { type: "number", inputmode: "numeric", min: 0, id: nuovoId("imp"),
    "aria-label": `${c.etiqueta}, cifra exacta en euros` });
  const tramoPrev = previo && typeof previo === "object" ? previo.tramo : undefined;
  const impPrev = previo && typeof previo === "object" ? previo.importe : undefined;
  if (typeof tramoPrev === "string") tramoSel.value = tramoPrev;
  if (prefieroNoDecirloIngreso(previo) && impPrev === undefined) tramoSel.value = "prefiero_no_decirlo";
  if (typeof impPrev === "number") importe.value = String(impPrev);
  const nodo = el("div", { class: "fila" },
    el("span", { class: "campo-etiqueta", text: c.etiqueta }),
    el("label", { class: "campo-etiqueta", for: tramoSel.id, text: "Tramo" }), tramoSel,
    el("label", { class: "campo-etiqueta", for: importe.id, text: "O la cifra exacta en euros (opcional)" }), importe,
    el("p", { class: "ayuda", text: "Si escribes la cifra, el tramo se calcula solo." }));
  const leerDi = () => {
    if (importe.value !== "") {
      const v = Number(importe.value);
      return Number.isInteger(v) && v >= 0 ? { importe: v, tramo: tramoDeImporte(v) } : { error: true };
    }
    // «Prefiero no decirlo» per un reddito non è un codice di tramo (docs/ESQUEMA.md §2.5): si salva come «no lo sé».
    if (tramoSel.value !== "") return { tramo: tramoSel.value === "prefiero_no_decirlo" ? "no_lo_se" : tramoSel.value };
    return undefined;
  };
  return {
    nodo, nombre: tramoSel,
    leer() {
      const d = leerDi();
      if (d && d.error) return { ok: false, error: `${c.etiqueta}: la cifra debe ser un número entero de euros.` };
      if (!d) return { ok: false, error: `${c.etiqueta}: elige un tramo o escribe la cifra.` };
      const esc = [];
      if (d.importe !== undefined) {
        esc.push([`${c.base}.importe`, d.importe]);
        esc.push([`${c.base}.tramo`, d.tramo || undefined]);
      } else {
        esc.push([`${c.base}.tramo`, d.tramo]);
        esc.push([`${c.base}.importe`, undefined]);
      }
      return { ok: true, escrituras: esc };
    },
    borrador() {
      const d = leerDi();
      if (!d || d.error) return [];
      return d.importe !== undefined ? [[`${c.base}.importe`, d.importe], [`${c.base}.tramo`, d.tramo]] : [[`${c.base}.tramo`, d.tramo]];
    },
    // Vero solo se la scelta è «Prefiero no decirlo» e non c'è una cifra.
    prefiere: () => importe.value === "" && tramoSel.value === "prefiero_no_decirlo",
  };
}

// Figli: lista di {anio_nacimiento, mes_nacimiento}, o «ninguno» o «no lo sé».
function controlloHijos(c, previo) {
  const nls = el("input", { type: "checkbox", id: nuovoId("hnls") });
  const ninguno = el("input", { type: "checkbox", id: nuovoId("hnin") });
  nls.checked = previo === "no_lo_se";
  ninguno.checked = Array.isArray(previo) && previo.length === 0;
  const filas = el("div", { class: "hijos" });
  const filaHijo = (h) => {
    const anio = el("input", { type: "number", inputmode: "numeric", min: 1900, max: 2100, "aria-label": "Año de nacimiento del hijo o hija" });
    const anioNls = el("input", { type: "checkbox", id: nuovoId("ahn") });
    const mes = el("select", { "aria-label": "Mes de nacimiento del hijo o hija" },
      el("option", { value: "no_lo_se", text: "Mes: no lo sé" }),
      Array.from({ length: 12 }, (_, i) => el("option", { value: String(i + 1), text: String(i + 1) })));
    if (h && typeof h.anio_nacimiento === "number") anio.value = String(h.anio_nacimiento);
    if (h && h.anio_nacimiento === "no_lo_se") anioNls.checked = true;
    if (h && typeof h.mes_nacimiento === "number") mes.value = String(h.mes_nacimiento);
    anio.disabled = anioNls.checked;
    anioNls.addEventListener("change", () => { anio.disabled = anioNls.checked; });
    const fila = el("div", { class: "hijo" }, anio, el("label", { class: "nls" }, anioNls, " No lo sé"), mes,
      el("button", { type: "button", class: "secundario", text: "Quitar", "aria-label": "Quitar este hijo o hija",
        onclick: () => fila.remove() }));
    return { fila, anio, anioNls, mes };
  };
  const filasHijos = [];
  const agregar = (h) => {
    const x = filaHijo(h);
    filasHijos.push(x);
    filas.append(x.fila);
  };
  if (Array.isArray(previo)) previo.forEach(agregar);
  const anadir = el("button", { type: "button", class: "secundario", text: "Añadir hijo o hija",
    onclick: () => agregar(null) });
  nls.addEventListener("change", () => { if (nls.checked) { ninguno.checked = false; filas.replaceChildren(); filasHijos.length = 0; } });
  ninguno.addEventListener("change", () => { if (ninguno.checked) { nls.checked = false; filas.replaceChildren(); filasHijos.length = 0; } });
  const nodo = el("fieldset", { class: "grupo" }, el("legend", { class: "campo-etiqueta", text: c.etiqueta }),
    el("label", { class: "opcion" }, ninguno, " No tengo hijos que vivan conmigo o estén a mi cargo"),
    filas, anadir,
    el("label", { class: "nls" }, nls, " No lo sé"));
  const leerDi = () => {
    if (nls.checked) return "no_lo_se";
    if (ninguno.checked) return [];
    if (!filasHijos.length) return undefined;
    return filasHijos.filter((x) => x.fila.isConnected).map((x) => ({
      anio_nacimiento: x.anioNls.checked ? "no_lo_se" : (x.anio.value === "" ? "err" : Number(x.anio.value)),
      mes_nacimiento: x.mes.value === "no_lo_se" ? "no_lo_se" : Number(x.mes.value),
    }));
  };
  return {
    nodo, nombre: ninguno,
    leer() {
      const v = leerDi();
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: marca «No tengo hijos…», añade cada hijo o marca «No lo sé».` };
      if (Array.isArray(v) && v.some((h) => h.anio_nacimiento === "err" || (typeof h.anio_nacimiento === "number" && (h.anio_nacimiento < 1900 || h.anio_nacimiento > 2100)))) {
        return { ok: false, error: `${c.etiqueta}: escribe el año de nacimiento de cada hijo o marca «No lo sé».` };
      }
      return { ok: true, escrituras: [[c.campo, v]] };
    },
    borrador() {
      const v = leerDi();
      if (v === undefined || (Array.isArray(v) && v.some((h) => h.anio_nacimiento === "err"))) return [];
      return [[c.campo, v]];
    },
  };
}

const FABRICA = {
  anio: controlloNumero, entero: controlloNumero, fecha: controlloFecha, texto: controlloTexto,
  select: controlloSelect, radio: controlloRadio, bool: controlloBool, lista: controlloLista,
  paises: controlloPaises, pais: controlloPais, tramo: controlloTramo, hijos: controlloHijos,
  municipio: controlloMunicipio,
};

// Ruta di un controllo per il riepilogo e per «hay algo que escribir».
function rutaPrincipal(c) { return c.campo || c.base; }

// Il testo «por qué lo preguntamos» di una pantalla: è una frase, o una funzione della bozza del profilo.
function textoDePorque(pantalla, perfilo) {
  return typeof pantalla.porque === "function" ? pantalla.porque(perfilo) : pantalla.porque;
}

export function renderCuestionario(ctx) {
  const { usados } = ctx;
  const visibili = pantallasVisibili(ctx);
  if (!ctx.pila.length || !visibili.some((p) => p.id === ctx.pila[ctx.pila.length - 1])) {
    ctx.pila.splice(0, ctx.pila.length, visibili[0].id);
  }
  const actual = ctx.pila[ctx.pila.length - 1];
  const pantalla = PANTALLAS.find((p) => p.id === actual);
  const posicion = visibili.findIndex((p) => p.id === actual) + 1;

  const titulo = el("h1", { tabindex: -1, id: "titulo-pantalla", text: pantalla.titulo });
  const textoPorque = el("span", { text: textoDePorque(pantalla, ctx.perfil) });
  const porque = el("p", { class: "porque" }, el("strong", { text: "¿Por qué lo preguntamos? " }), textoPorque);
  const error = el("div", { class: "error-form", role: "alert", "aria-live": "assertive" });
  const formulario = el("form", { novalidate: true, class: "pregunta-form" });
  const barra = el("div", { class: "barra-paso" }, el("span", { text: `Pregunta ${posicion}` }));

  // Controlli di questa pantalla: quelli visibili per l'uso delle schede (anche se nascosti per una condizione).
  const cosas = pantalla.controles.filter((c) => (c.siempre || (c.campo ? [c.campo] : [`${c.base}.tramo`, `${c.base}.importe`]).some((x) => usados.has(x))));
  // Il valore che un controllo della pantalla scrive adesso (vuoto se nascosto o non scelto).
  const valorDe = (campo) => {
    const x = controles.find((y) => y.def.campo === campo);
    if (!x || x.grupo.hidden) return undefined;
    const d = x.borrador();
    return d.length ? d[0][1] : undefined;
  };
  const controles = cosas.map((c) => {
    let previo = leer(ctx.perfil, c.campo || c.base);
    if (c.tipo === "radio" && c.campo === "residencia.pais") {
      c = { ...c, radio_pais_otro: true };
      // Un paese scelto dal menu (per esempio FR) si ricorda come «En otro país».
      if (typeof previo === "string" && /^[A-Z]{2}$/.test(previo) && previo !== "ES") previo = "otro";
    }
    if (c.ong_si_otro) c = { ...c, ongs: (ctx.catalogo?.ayuda_humana || []).filter((a) => a.tipo === "ong").slice(0, 2) };
    if (c.tipo === "municipio") {
      c = { ...c, ine_previo: leer(ctx.perfil, c.ine), recuerda_no_se: municipioNoSabe(ctx.perfil),
        provincia_de: () => valorDe("residencia.provincia") };
    }
    // Il codice INE 46250 salvato resta nel campo INE: si cancella solo se il comune cambia (vedi controlloMunicipio).
    const f = FABRICA[c.tipo];
    const r = f(c, previo, ctx.hoy, ctx.perfil);
    r.def = c;
    r.grupo = el("div", { class: "control", "data-campo": rutaPrincipal(c) }, r.nodo, el("p", { class: "error-control", role: "alert" }));
    return r;
  });

  const nodosControles = controles.map((x) => x.grupo);
  formulario.append(...nodosControles);

  // Visibilità a punto fisso: la bozza è fatta solo dai controlli che si mostrano, e un controllo con «si» si mostra
  // in base a quella bozza. Un controllo nascosto non scrive: un valore rimasto in un menu nascosto non può riaccenderlo.
  const costruye = (visibles) => {
    let p = ctx.perfil;
    for (const x of controles) if (visibles.has(x)) for (const [ruta, valor] of x.borrador()) p = escribir(p, ruta, valor);
    return p;
  };
  const calcVisibles = () => {
    let vis = new Set(controles.filter((x) => !x.def.si));
    let b = costruye(vis);
    for (let giro = 0; giro <= controles.length; giro++) {
      const nueva = new Set(controles.filter((x) => !x.def.si || x.def.si(b)));
      const igual = nueva.size === vis.size && [...nueva].every((x) => vis.has(x));
      if (igual) break;
      vis = nueva;
      b = costruye(vis);
    }
    return { vis, b };
  };
  const aggiornaVisibili = () => {
    const { vis, b } = calcVisibles();
    textoPorque.textContent = textoDePorque(pantalla, b);
    for (const x of controles) {
      if (x.actualiza) x.actualiza(b);
      x.grupo.hidden = !vis.has(x);
    }
  };
  formulario.addEventListener("change", aggiornaVisibili);
  formulario.addEventListener("input", aggiornaVisibili);
  aggiornaVisibili();

  // Attenzione: i controlli nascosti non entrano nella scrittura, e i loro campi si svuotano se nessun altro li scrive.
  const atras = ctx.pila.length > 1 ? el("button", { type: "button", class: "secundario", text: "Atrás",
    onclick: () => { ctx.pila.pop(); ctx.render(); } }) : null;
  const siguiente = el("button", { type: "submit", class: "principal", text: "Siguiente" });
  const nav = el("div", { class: "acciones" }, atras, siguiente);

  formulario.addEventListener("submit", (ev) => {
    ev.preventDefault();
    error.textContent = "";
    let primero = null;
    const escrituras = [];
    const visiblesPaths = new Set();
    for (const x of controles) {
      x.grupo.querySelector(".error-control").textContent = "";
      if (x.grupo.hidden) continue;
      const r = x.leer();
      if (!r.ok) {
        x.grupo.querySelector(".error-control").textContent = r.error;
        if (!primero) primero = x;
        continue;
      }
      for (const [ruta, valor] of r.escrituras) { escrituras.push([ruta, valor]); visiblesPaths.add(ruta); }
    }
    if (primero) {
      error.textContent = "Revisa esta pregunta antes de seguir.";
      primero.grupo.querySelector("input, select, button, [tabindex]")?.focus();
      return;
    }
    // Campi di controlli nascosti che nessun controllo visibile scrive: si cancellano.
    for (const x of controles) {
      if (!x.grupo.hidden) continue;
      if (x.def.campo && !visiblesPaths.has(x.def.campo)) escrituras.push([x.def.campo, undefined]);
      if (x.def.base) {
        for (const suf of [".tramo", ".importe"]) if (!visiblesPaths.has(x.def.base + suf)) escrituras.push([x.def.base + suf, undefined]);
      }
    }
    let nuevo = ctx.perfil;
    for (const [ruta, valor] of escrituras) nuevo = escribir(nuevo, ruta, valor);
    // Ricorda «Prefiero no decirlo» sull'oggetto del reddito appena scritto (vedi PREFIERO_INGRESO).
    for (const x of controles) {
      if (!x.grupo.hidden && x.prefiere && x.prefiere()) PREFIERO_INGRESO.add(leer(nuevo, x.def.base));
    }
    // Ricorda «No lo sé» sul comune sull'oggetto residencia appena scritto (vedi MUNICIPIO_NO_SE).
    for (const x of controles) {
      if (!x.grupo.hidden && x.noSabe && x.noSabe()) {
        const r = leer(nuevo, "residencia");
        if (r && typeof r === "object") MUNICIPIO_NO_SE.add(r);
      }
    }
    if (escrituras.some(([r]) => r.startsWith("ingresos.")) && nuevo.ingresos && nuevo.ingresos.ejercicio === undefined) {
      nuevo = escribir(nuevo, "ingresos.ejercicio", Number(ctx.hoy.slice(0, 4)) - 1);
    }
    // Pantalla siguiente: la primera visible después de la actual, con el perfil ya aggiornato.
    const idx = PANTALLAS.findIndex((p) => p.id === actual);
    const sig = PANTALLAS.slice(idx + 1).find((p) => controlesVisibles(p, nuevo, usados).length > 0);
    if (sig) ctx.pila.push(sig.id);
    ctx.aplicar(nuevo, sig ? "pregunta" : "resultados");
  });

  formulario.append(error, nav);
  const cont = el("section", { class: "pantalla-pregunta" }, barra, titulo, porque, formulario);
  return cont;
}

function pantallasVisibili(ctx) {
  return pantallasVisibles(ctx.perfil, ctx.usados);
}
