// La pantalla de las preguntas: una pantalla por vez, atrás sin perder nada, «no lo sé» siempre.
import { el, nuovoId } from "./dom.js";
import { PANTALLAS, PAISES, TRAMOS, controlesVisibles, pantallasVisibles, escribir, leer, tramoDeImporte, esValencia,
  previoAutorizaTrabajar, opcionDisponible, quitaIncompatibles, quitaRespuestasOcultas } from "../preguntas.js";

// Il comune «No lo sé» non ha un codice nello schema (docs/ESQUEMA.md §2.5): si ricorda sull'oggetto residencia
// salvato, come il reddito con PREFIERO_INGRESO. Se residencia cambia oggetto (cioè si riscrive), il ricordo cade.
const MUNICIPIO_NO_SE = new WeakSet();
export function municipioNoSabe(perfil) {
  const r = leer(perfil, "residencia");
  return !!r && typeof r === "object" && MUNICIPIO_NO_SE.has(r);
}

// «En otro país» con «No lo sé» nel menu del paese: il paese si salva come «no lo sé» (lo schema non ha un altro codice),
// e per ricordare la scelta al ritorno (Atrás) si tiene l'oggetto residencia così salvato, come per il comune.
const OTRO_NO_SE = new WeakSet();
export function otroPaisNoSabe(perfil) {
  const r = leer(perfil, "residencia");
  return !!r && typeof r === "object" && OTRO_NO_SE.has(r);
}

const SIN_VALOR = "__vacio__";

// L'anno massimo di nascita (o di un figlio) è l'anno corrente: un anno futuro non si accetta (hoy è AAAA-MM-DD).
function anioMaximo(max, hoy) {
  const y = Number(String(hoy || "").slice(0, 4));
  return Number.isInteger(y) && y > 0 ? Math.min(max, y) : max;
}

// «No lo sé» sta in cima al menu, subito dopo il segnaposto: in una lista lunga (69 paesi) non deve finire in fondo.
export function opcionesConNoSe(lista) {
  const nls = lista.find(([v]) => v === "no_lo_se");
  return nls ? [nls, ...lista.filter(([v]) => v !== "no_lo_se")] : lista;
}
// Il menu di un paese: il segnaposto, «No lo sé» in cima, la risposta extra del campo (per esempio «No tengo permiso…»)
// e poi i paesi, «Otro país» compreso.
export function opcionesPaisMenu(extra) {
  return [["", "Elige un país"], ["no_lo_se", "No lo sé"], ...(extra ? [extra] : []), ...PAISES];
}
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

// Campi di anno e mese (docs/ESQUEMA.md §3.1): un gruppo con due campi di stile uguale, mese facoltativo (1-12) e anno
// (4 cifre). Testo con tastiera numerica, nessuno spinner. Il mese, se c'è, si scrive come AAAA-MM; senza, AAAA.
function campoAnio(etiqueta) {
  return el("input", { type: "text", inputmode: "numeric", pattern: "[0-9]*", maxlength: 4, autocomplete: "off",
    id: nuovoId("ay"), placeholder: "AAAA", "aria-label": `${etiqueta}: año (4 cifras)` });
}
function campoMes(etiqueta) {
  return el("input", { type: "text", inputmode: "numeric", pattern: "[0-9]*", maxlength: 2, autocomplete: "off",
    id: nuovoId("me"), placeholder: "MM", "aria-label": `${etiqueta}: mes (1 a 12, opcional)` });
}
// Mese letto: undefined se vuoto, null se non valido, altrimenti il numero.
function leerMesCampo(mes) {
  const t = mes.value.trim();
  if (t === "") return undefined;
  if (!/^\d{1,2}$/.test(t)) return null;
  const v = Number(t);
  return v >= 1 && v <= 12 ? v : null;
}

function controlloMesAnio(c, previo, hoy) {
  const maxAnio = anioMaximo(c.max, hoy);
  const anio = campoAnio(c.etiqueta);
  const mes = campoMes(c.etiqueta);
  const chk = el("input", { type: "checkbox", id: nuovoId("nls") });
  if (typeof previo === "number") anio.value = String(previo);
  if (typeof c.previo_mes === "number") mes.value = String(c.previo_mes);
  chk.checked = previo === "no_lo_se";
  const aplicaNls = () => { anio.disabled = chk.checked; mes.disabled = chk.checked; };
  aplicaNls();
  chk.addEventListener("change", () => { if (chk.checked) mes.value = ""; aplicaNls(); });
  const nodo = el("div", { class: "fila" },
    el("span", { class: "campo-etiqueta", text: c.etiqueta }),
    el("div", { class: "fila-linea" },
      el("div", { class: "fila" }, el("label", { class: "campo-etiqueta", for: mes.id, text: "Mes (opcional)" }), mes),
      el("div", { class: "fila" }, el("label", { class: "campo-etiqueta", for: anio.id, text: "Año" }), anio)),
    el("label", { class: "nls" }, chk, " No lo sé"));
  const anioDi = () => {
    if (chk.checked) return "no_lo_se";
    const t = anio.value.trim();
    if (!/^\d{4}$/.test(t)) return undefined;
    const v = Number(t);
    return v >= c.min && v <= maxAnio ? v : undefined;
  };
  const escrituras = (a, m) => {
    if (a === "no_lo_se") return [[c.campo, "no_lo_se"], [c.campo_mes, undefined]];
    return [[c.campo, a], [c.campo_mes, typeof m === "number" ? m : undefined]];
  };
  return {
    nodo, nombre: anio,
    leer() {
      if (chk.checked) return { ok: true, escrituras: escrituras("no_lo_se") };
      if (anio.value.trim() === "") return { ok: false, error: `${c.etiqueta}: escribe el año (4 cifras) o marca «No lo sé».` };
      const a = anioDi();
      if (a === undefined) return { ok: false, error: `${c.etiqueta}: el año tiene 4 cifras y va de ${c.min} a ${maxAnio}.` };
      const m = leerMesCampo(mes);
      if (m === null) return { ok: false, error: `${c.etiqueta}: el mes va de 1 a 12, o déjalo vacío.` };
      return { ok: true, escrituras: escrituras(a, m) };
    },
    borrador() {
      if (chk.checked) return escrituras("no_lo_se");
      const a = anioDi();
      if (a === undefined) return [];
      const m = leerMesCampo(mes);
      return escrituras(a, m === null ? undefined : m);
    },
  };
}

// Data anno-mese (empadronado, residencia legal, documento): AAAA o AAAA-MM, con «No lo sé».
function controlloFecha(c, previo, hoy) {
  const anio = campoAnio(c.etiqueta);
  const mes = campoMes(c.etiqueta);
  const chk = el("input", { type: "checkbox", id: nuovoId("nls") });
  if (typeof previo === "string" && previo !== "no_lo_se") {
    const m = /^(\d{4})(?:-(\d{2}))?/.exec(previo);
    if (m) {
      anio.value = m[1];
      if (m[2]) mes.value = String(Number(m[2]));
    }
  }
  chk.checked = previo === "no_lo_se";
  const aplicaNls = () => { anio.disabled = chk.checked; mes.disabled = chk.checked; };
  aplicaNls();
  chk.addEventListener("change", () => { if (chk.checked) mes.value = ""; aplicaNls(); });
  const nodo = el("div", { class: "fila" },
    el("span", { class: "campo-etiqueta", text: c.etiqueta }),
    el("div", { class: "fila-linea" },
      el("div", { class: "fila" }, el("label", { class: "campo-etiqueta", for: mes.id, text: "Mes (opcional)" }), mes),
      el("div", { class: "fila" }, el("label", { class: "campo-etiqueta", for: anio.id, text: "Año" }), anio)),
    el("p", { class: "ayuda", text: "Ejemplos: 2019, o 2019 y 6 (junio)." }),
    el("label", { class: "nls" }, chk, " No lo sé"));
  // Il valore scritto, o undefined se non è una data valida (nel futuro, se la data non può esserlo).
  const valorDi = () => {
    if (chk.checked) return "no_lo_se";
    const t = anio.value.trim();
    if (!/^\d{4}$/.test(t)) return undefined;
    const m = leerMesCampo(mes);
    if (m === null) return undefined;
    const texto = m === undefined ? t : `${t}-${String(m).padStart(2, "0")}`;
    const e = extremosFecha(texto);
    if (!e) return undefined;
    if (!c.futuro && e.prima > hoy) return undefined;
    return texto;
  };
  return {
    nodo, nombre: anio,
    leer() {
      if (chk.checked) return { ok: true, escrituras: [[c.campo, "no_lo_se"]] };
      if (anio.value.trim() === "") return { ok: false, error: `${c.etiqueta}: escribe el año o marca «No lo sé».` };
      if (leerMesCampo(mes) === null) return { ok: false, error: `${c.etiqueta}: el mes va de 1 a 12, o déjalo vacío.` };
      if (valorDi() === undefined) return { ok: false, error: `${c.etiqueta}: la fecha no es válida${c.futuro ? "" : " o está en el futuro"}.` };
      return { ok: true, escrituras: [[c.campo, valorDi()]] };
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
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: ${String(c.error || "revisa el dato").replace(/\.$/, "")}, o marca «No lo sé».` };
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
      ...opcionesConNoSe(lista).map(([codigo, texto]) => el("option", { value: String(codigo), text: texto })));
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

// Il codice null (Otra situación) non si salva come valore: il campo resta vuoto. Per ricordare la scelta al ritorno
// (Atrás) si tiene il campo in questo insieme, finché la risposta non cambia o si toglie.
const OPCION_NULA = new Set();

// Pulsanti radio con etichette. Il codice null (Otra situación) cancella il campo. «Quitar respuesta» toglie la scelta.
function controlloRadio(c, previo, pantalla) {
  const nome = nuovoId("r");
  const recuerda = previo === undefined && OPCION_NULA.has(c.campo);
  const righe = c.opciones.map(([codigo, texto]) => {
    const valore = codigo === null ? SIN_VALOR : codigo;
    const input = el("input", { type: "radio", name: nome, value: valore, id: nuovoId("ro") });
    const previoVal = previo === null ? SIN_VALOR : previo;
    if (previo !== undefined && previoVal === valore) input.checked = true;
    if (recuerda && codigo === null) input.checked = true;
    return { input, codigo, nodo: el("label", { class: "opcion" }, input, texto) };
  });
  const ayuda = el("div", { class: "ayuda-ong", hidden: true });
  const cambio = () => {
    const sel = righe.find((r) => r.input.checked);
    if (c.ong_si_otro) ayuda.hidden = !(sel && sel.codigo === null);
    if (c.ong_si_otro) pintaOng(ayuda, c.ongs);
  };
  righe.forEach((r) => r.input.addEventListener("change", cambio));
  // Un'opzione non disponibile con le risposte già date (punto 9: «No trabajo» se si lavora) si disattiva, e se era scelta si toglie.
  const aplicaDisponibilidad = (b) => {
    for (const r of righe) {
      const libre = opcionDisponible(c.campo, String(r.codigo), b);
      r.input.disabled = !libre;
      if (!libre && r.input.checked) r.input.checked = false;
    }
    cambio();
  };
  const legenda = el("legend", { class: "campo-etiqueta", text: c.etiqueta });
  const spiegazione = c.ayuda ? botonAyuda(c.ayuda, nuovoId("ayp"), legenda) : null;
  const quitar = el("button", { type: "button", class: "secundario", text: "Quitar respuesta", onclick: () => {
    for (const r of righe) r.input.checked = false;
    OPCION_NULA.delete(c.campo);
    cambio();
    nodo.dispatchEvent(new Event("change", { bubbles: true }));
  } });
  const nodo = el("fieldset", { class: "grupo" }, legenda, spiegazione ? spiegazione.panel : null,
    righe.map((r) => r.nodo), quitar, ayuda);
  cambio();
  const valorDi = () => {
    const sel = righe.find((r) => r.input.checked);
    return sel ? { codigo: sel.codigo } : undefined;
  };
  // Scritture che la scelta porta con sé (c.extra), per esempio il permesso di lavoro di un documento.
  // «En otro país» non scrive un paese: il paese lo scrive il menu che si apre sotto (vedi renderCuestionario). Il campo
  // si svuota, così un paese vecchio non riapre il menu né la CV.
  const conExtra = (codigo) => {
    if (c.radio_pais_otro && codigo === "otro") return [[c.campo, undefined]];
    return [[c.campo, codigo], ...(c.extra ? c.extra(codigo) : [])];
  };
  const alternativa = c.opciones.some(([k]) => k === "prefiero_no_decirlo");
  return {
    nodo, nombre: righe[0].input,
    actualiza: aplicaDisponibilidad,
    // Nessuna scelta (dopo «Quitar respuesta»): la schermata lo sa, e il paese salvato non conta (punto 10).
    sinElegir: () => !valorDi(),
    esOtro: () => { const sel = valorDi(); return !!sel && sel.codigo === "otro"; },
    leer() {
      const sel = valorDi();
      if (!sel) return { ok: false, error: `${c.etiqueta}: elige una opción${alternativa ? " o «Prefiero no decirlo»" : ""}.` };
      if (sel.codigo === null) OPCION_NULA.add(c.campo); else OPCION_NULA.delete(c.campo);
      return { ok: true, escrituras: conExtra(sel.codigo) };
    },
    borrador() {
      const sel = valorDi();
      if (!sel) return [];
      return conExtra(sel.codigo);
    },
  };
}

// Il pulsante «?» accanto a una domanda difficile: apre una spiegazione breve. Si apre e si chiude con il pulsante,
// con Esc (dal pulsante o dentro la spiegazione, e il fuoco torna al pulsante) o con «Cerrar».
function botonAyuda(ayuda, idPanel, legenda) {
  const boton = el("button", { type: "button", class: "secundario", text: "?", "aria-expanded": "false",
    "aria-controls": idPanel, "aria-label": `Ayuda: ${ayuda.titulo}` });
  const cerrar = () => { panel.hidden = true; boton.setAttribute("aria-expanded", "false"); };
  const abrir = () => { panel.hidden = false; boton.setAttribute("aria-expanded", "true"); };
  const panel = el("div", { class: "ayuda", id: idPanel, hidden: true, role: "region", "aria-label": ayuda.titulo },
    el("p", { text: ayuda.intro }),
    el("dl", null, ayuda.filas.map(([nombre, desc]) => [el("dt", { text: nombre }), el("dd", { text: desc })])),
    el("button", { type: "button", class: "secundario", text: "Cerrar", onclick: () => { cerrar(); boton.focus(); } }));
  boton.addEventListener("click", () => (panel.hidden ? abrir() : cerrar()));
  boton.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { e.preventDefault(); cerrar(); } });
  panel.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); cerrar(); boton.focus(); } });
  legenda.append(" ", boton);
  return { panel };
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
  nodo.append("Elige esta opción si prefieres no decirlo.");
}

function controlloBool(c, previo) {
  const nome = nuovoId("b");
  const op = [["true", "Sí"], ["false", "No"], ["no_lo_se", "No lo sé"]];
  const inputs = op.map(([v, t]) => {
    const input = el("input", { type: "radio", name: nome, value: v, id: nuovoId("bo") });
    if (previo !== undefined && String(previo) === v) input.checked = true;
    return { input, nodo: el("label", { class: "opcion" }, input, t), v };
  });
  const quitar = el("button", { type: "button", class: "secundario", text: "Quitar respuesta", onclick: () => {
    for (const x of inputs) x.input.checked = false;
    nodo.dispatchEvent(new Event("change", { bubbles: true }));
  } });
  const nodo = el("fieldset", { class: "grupo" }, el("legend", { class: "campo-etiqueta", text: c.etiqueta }), inputs.map((x) => x.nodo), quitar);
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
  // Situazioni incompatibili (punto 9): «jubilado» e «inactivo» escludono le altre situazioni di lavoro, e viceversa.
  const incompatibles = (sorgente) => {
    if (!sorgente.checked || !righe.some((r) => r.input === sorgente)) return;
    const quedan = quitaIncompatibles(righe.filter((r) => r.input.checked).map((r) => r.codigo), sorgente.value);
    for (const r of righe) if (r.input.checked && !quedan.includes(r.codigo)) r.input.checked = false;
  };
  todas.forEach((x) => x.addEventListener("change", () => { esclusiva(x); incompatibles(x); }));
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
  // Un paese scelto dal menu diventa subito un'etichetta rimovibile: niente pulsante «Añadir país».
  menu.addEventListener("change", () => {
    if (!menu.value) return;
    if (!lista.includes(menu.value)) lista.push(menu.value);
    nls.checked = false;
    if (nadie) nadie.checked = false;
    menu.value = "";
    pinta();
  });
  nls.addEventListener("change", () => { if (nls.checked) { lista = []; if (nadie) nadie.checked = false; pinta(); } });
  if (nadie) nadie.addEventListener("change", () => { if (nadie.checked) { lista = []; nls.checked = false; pinta(); } });
  pinta();
  const nodo = el("div", { class: "fila" },
    el("span", { class: "campo-etiqueta", text: c.etiqueta }),
    chips,
    el("div", { class: "fila-linea" }, menu),
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
      const pide = c.nadie ? `añade un país, marca «${c.nadie[1]}» o «No lo sé».` : "añade un país o marca «No lo sé».";
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: ${pide}` };
      return { ok: true, escrituras: [[c.campo, v]] };
    },
    borrador: () => (leerDi() === undefined ? [] : [[c.campo, leerDi()]]),
  };
}

// Un solo paese, con «No lo sé» (menu).
// Con «nadie» (il permiso di guida) il menu offre anche la sua risposta, dopo «No lo sé».
function controlloPais(c, previo) {
  const menu = el("select", { id: nuovoId("pm1"), "aria-label": c.etiqueta },
    opcionesPaisMenu(c.nadie || null).map(([k, t]) => el("option", { value: k, text: t })));
  if (typeof previo === "string") menu.value = previo;
  const nodo = el("div", { class: "fila" }, el("label", { class: "campo-etiqueta", for: menu.id, text: c.etiqueta }), menu);
  const leerDi = () => (menu.value ? menu.value : undefined);
  return {
    nodo, nombre: menu,
    vacia: () => { menu.value = ""; },
    leer() {
      const v = leerDi();
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: elige un país${c.nadie ? `, «${c.nadie[1]}»` : ""} o «No lo sé».` };
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
function controlloHijos(c, previo, hoy) {
  const maxAnio = anioMaximo(2100, hoy);
  const nls = el("input", { type: "checkbox", id: nuovoId("hnls") });
  const ninguno = el("input", { type: "checkbox", id: nuovoId("hnin") });
  nls.checked = previo === "no_lo_se";
  ninguno.checked = Array.isArray(previo) && previo.length === 0;
  const filas = el("div", { class: "hijos" });
  const filaHijo = (h) => {
    const mes = campoMes("Hijo o hija");
    const anio = campoAnio("Hijo o hija");
    const anioNls = el("input", { type: "checkbox", id: nuovoId("ahn") });
    if (h && typeof h.anio_nacimiento === "number") anio.value = String(h.anio_nacimiento);
    if (h && h.anio_nacimiento === "no_lo_se") anioNls.checked = true;
    if (h && typeof h.mes_nacimiento === "number") mes.value = String(h.mes_nacimiento);
    anio.disabled = anioNls.checked;
    anioNls.addEventListener("change", () => { anio.disabled = anioNls.checked; });
    const fila = el("div", { class: "hijo" }, mes, anio, el("label", { class: "nls" }, anioNls, " No lo sé"),
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
  // Aggiungere un figlio toglie «No tengo hijos» e «No lo sé»: altrimenti il figlio si scarta in silenzio.
  const anadir = el("button", { type: "button", class: "secundario", text: "Añadir hijo o hija",
    onclick: () => { ninguno.checked = false; nls.checked = false; agregar(null); } });
  nls.addEventListener("change", () => { if (nls.checked) { ninguno.checked = false; filas.replaceChildren(); filasHijos.length = 0; } });
  ninguno.addEventListener("change", () => { if (ninguno.checked) { nls.checked = false; filas.replaceChildren(); filasHijos.length = 0; } });
  const nodo = el("fieldset", { class: "grupo" }, el("legend", { class: "campo-etiqueta", text: c.etiqueta }),
    el("label", { class: "opcion" }, ninguno, " No tengo hijos que vivan conmigo o estén a mi cargo"),
    filas, anadir,
    el("label", { class: "nls" }, nls, " No lo sé"));
  const leerDi = () => {
    if (nls.checked) return "no_lo_se";
    const vive = filasHijos.filter((x) => x.fila.isConnected);
    // Con «No tengo hijos» spunta e figli in lista, la risposta è contraddittoria: si chiede di scegliere.
    if (ninguno.checked) return vive.length ? undefined : [];
    if (!filasHijos.length) return undefined;
    return vive.map((x) => {
      const h = { anio_nacimiento: x.anioNls.checked ? "no_lo_se" : (/^\d{4}$/.test(x.anio.value.trim()) ? Number(x.anio.value.trim()) : "err") };
      const m = leerMesCampo(x.mes);
      if (m === null) h.mes_nacimiento = "err";
      else if (m !== undefined) h.mes_nacimiento = m;
      return h;
    });
  };
  return {
    nodo, nombre: ninguno,
    leer() {
      const v = leerDi();
      if (v === undefined) return { ok: false, error: `${c.etiqueta}: marca «No tengo hijos que vivan conmigo o estén a mi cargo», añade cada hijo o marca «No lo sé».` };
      if (Array.isArray(v) && v.some((h) => h.anio_nacimiento === "err" || h.mes_nacimiento === "err"
        || (typeof h.anio_nacimiento === "number" && (h.anio_nacimiento < 1900 || h.anio_nacimiento > maxAnio)))) {
        return { ok: false, error: `${c.etiqueta}: escribe el año (4 cifras, no posterior a ${maxAnio}) de cada hijo o marca «No lo sé», y el mes solo si lo sabes (1 a 12).` };
      }
      return { ok: true, escrituras: [[c.campo, v]] };
    },
    borrador() {
      const v = leerDi();
      if (v === undefined || (Array.isArray(v) && v.some((h) => h.anio_nacimiento === "err" || h.mes_nacimiento === "err"))) return [];
      return [[c.campo, v]];
    },
  };
}

export const FABRICA = {
  anio: controlloNumero, mesanio: controlloMesAnio, entero: controlloNumero, fecha: controlloFecha, texto: controlloTexto,
  select: controlloSelect, radio: controlloRadio, bool: controlloBool, lista: controlloLista,
  paises: controlloPaises, pais: controlloPais, tramo: controlloTramo, hijos: controlloHijos,
  municipio: controlloMunicipio,
};

// Ruta di un controllo per il riepilogo e per «hay algo que escribir».
function rutaPrincipal(c) { return c.campo || c.base; }

// Il testo «por qué lo preguntamos» di una pantalla: è una frase, o una funzione della bozza del profilo.
function textoDePorque(pantalla, perfilo, ui) {
  return typeof pantalla.porque === "function" ? pantalla.porque(perfilo, ui) : pantalla.porque;
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
  const textoPorque = el("span", { text: textoDePorque(pantalla, ctx.perfil, { otroPais: false }) });
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
    if (c.tipo === "mesanio") c = { ...c, previo_mes: leer(ctx.perfil, c.campo_mes) };
    if (c.tipo === "radio" && c.campo === "residencia.pais") {
      c = { ...c, radio_pais_otro: true };
      // Un paese scelto dal menu (per esempio FR) si ricorda come «En otro país»; così anche «No lo sé» scelto nel menu.
      if (typeof previo === "string" && /^[A-Z]{2}$/.test(previo) && previo !== "ES") previo = "otro";
      else if (previo === "no_lo_se" && otroPaisNoSabe(ctx.perfil)) previo = "otro";
    }
    // Il menu del paese: «ES» non lo riapre; «No lo sé» lo riapre solo se il radio era «En otro país» (vedi OTRO_NO_SE).
    if (c.tipo === "pais" && c.campo === "residencia.pais" && (previo === "ES" || (previo === "no_lo_se" && !otroPaisNoSabe(ctx.perfil)))) {
      previo = undefined;
    }
    // «¿Tu documento te permite trabajar?»: con un documento che lo dà per legge il valore è automatico, non una risposta.
    if (c.campo === "situacion_administrativa.autoriza_trabajar") previo = previoAutorizaTrabajar(ctx.perfil);
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
  // Il radio «En otro país» e il menu del paese: il radio dice se il menu è aperto (ui.otroPais), il menu scrive il paese.
  const radioPais = controles.find((x) => x.def.campo === "residencia.pais" && x.def.radio_pais_otro);
  const menuPais = controles.find((x) => x.def.tipo === "pais" && x.def.campo === "residencia.pais");
  const uiDe = () => ({ otroPais: !!(radioPais && radioPais.esOtro()), sinElegir: !!(radioPais && radioPais.sinElegir()) });

  // Visibilità a punto fisso: la bozza è fatta solo dai controlli che si mostrano, e un controllo con «si» si mostra
  // in base a quella bozza. Un controllo nascosto non scrive: un valore rimasto in un menu nascosto non può riaccenderlo.
  const costruye = (visibles) => {
    let p = ctx.perfil;
    for (const x of controles) if (visibles.has(x)) for (const [ruta, valor] of x.borrador()) p = escribir(p, ruta, valor);
    return p;
  };
  const calcVisibles = () => {
    const ui = uiDe();
    let vis = new Set(controles.filter((x) => !x.def.si));
    let b = costruye(vis);
    for (let giro = 0; giro <= controles.length; giro++) {
      const nueva = new Set(controles.filter((x) => !x.def.si || x.def.si(b, ui)));
      const igual = nueva.size === vis.size && [...nueva].every((x) => vis.has(x));
      if (igual) break;
      vis = nueva;
      b = costruye(vis);
    }
    return { vis, b, ui };
  };
  const aggiornaVisibili = () => {
    const { vis, b, ui } = calcVisibles();
    // Senza «En otro país» il menu del paese è chiuso e vuoto: un paese scelto prima (o svuotato con «Quitar respuesta») non resta.
    if (radioPais && menuPais && !ui.otroPais) menuPais.vacia();
    textoPorque.textContent = textoDePorque(pantalla, b, ui);
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
      if (x.def.campo_mes && !visiblesPaths.has(x.def.campo_mes)) escrituras.push([x.def.campo_mes, undefined]);
      if (x.def.base) {
        for (const suf of [".tramo", ".importe"]) if (!visiblesPaths.has(x.def.base + suf)) escrituras.push([x.def.base + suf, undefined]);
      }
    }
    let nuevo = ctx.perfil;
    for (const [ruta, valor] of escrituras) nuevo = escribir(nuevo, ruta, valor);
    // Punto 8: le risposte delle schermate che ora non si mostrano (dopo un cambio di idea) escono dal profilo. Si fa prima
    // dei ricordi («En otro país», «No lo sé», «Prefiero no decirlo»), che stanno sugli oggetti scritti e non devono cambiare.
    nuevo = quitaRespuestasOcultas(nuevo, { otroPais: !!(radioPais && radioPais.esOtro()), sinElegir: false });
    // «En otro país» con «No lo sé» nel menu: si ricorda sull'oggetto residencia appena scritto (vedi OTRO_NO_SE).
    if (radioPais && !radioPais.grupo.hidden && radioPais.esOtro() && leer(nuevo, "residencia.pais") === "no_lo_se") {
      const r = leer(nuevo, "residencia");
      if (r && typeof r === "object") OTRO_NO_SE.add(r);
    }
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
