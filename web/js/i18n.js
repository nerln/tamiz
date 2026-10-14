// Lingua dell'interfaccia (lotto L37). La lingua è scritta nella pagina, in <html lang>:
// «es» (predefinita, nessun cambiamento) oppure «en» (le pagine in web/en/).
// In inglese un nodo di testo o un attributo visibile viene sostituito solo se TUTTO il suo testo (ripulito
// degli spazi) è una voce del dizionario (js/i18n-dic.js) o del catalogo tradotto (data/i18n-en.json),
// oppure se combacia con un modello di PATRONES (frase dell'interfaccia con parti variabili).
// I testi liberi delle fonti (titoli, nomi di enti, date dentro un titolo) restano interi in spagnolo.
// Niente si salva nel browser, e le richieste restano sull'origine della pagina.
import { DIC } from "./i18n-dic.js";

// Fuori dal browser (prove con node) il documento non c'è: la lingua è spagnola.
export const LANG = typeof document !== "undefined" && /^en\b/i.test(document.documentElement?.lang || "") ? "en" : "es";

// La radice di web/, calcolata dal file del modulo: vale sia da index.html sia da en/index.html.
export const RAIZ = new URL("../", import.meta.url);

const MAPA = new Map(Object.entries(DIC).map(([k, v]) => [k.trim(), v]));

const MESI_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];
const MESI_EN = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

// Una data dell'interfaccia, «5 de octubre de 2026» o «05/10/2026», in inglese: «October 5, 2026».
// Si usa solo dentro una frase intera dell'interfaccia (PATRONES), mai dentro un testo libero.
function enFecha(s) {
  let m = /^(\d{1,2}) de ([a-záéíóú]+) de (\d{4})$/.exec(s);
  if (m) {
    const i = MESI_ES.indexOf(m[2]);
    return i >= 0 ? `${MESI_EN[i]} ${Number(m[1])}, ${m[3]}` : s;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${MESI_EN[Number(m[2]) - 1]} ${Number(m[1])}, ${m[3]}`;
  return s;
}

// Un nome di area o di categoria dell'interfaccia: la voce del dizionario se c'è, altrimenti resta com'è.
function enVoce(s) {
  return MAPA.get(s.trim()) ?? s;
}
// Come enVoce, ma senza badare alle maiuscole (le etichette «Añadir a …» sono in minuscolo).
function enVoceCI(s) {
  const cerca = s.trim().toLowerCase();
  for (const [k, v] of MAPA) if (k.toLowerCase() === cerca) return v;
  return s;
}

const FE = String.raw`(\d{1,2} de [a-záéíóú]+ de \d{4}|\d{1,2}\/\d{1,2}\/\d{4})`;
const FN = String.raw`(\d{1,2}\/\d{1,2}\/\d{4})`;
// Costruisce un modello intero (^…$) da pezzi già scritti come espressione regolare.
const R = (...pezzi) => new RegExp("^" + pezzi.join("") + "$");

// Le frasi di convalida del questionario: «<etichetta>: <messaggio>», l'etichetta si traduce se è nel dizionario.
const CONVALIDA = [
  ["escribe el año (4 cifras) o marca «No lo sé».", "write the year (4 digits) or mark “I don't know”."],
  ["escribe el año (4 cifras) de cada hijo o marca «No lo sé», y el mes solo si lo sabes (1 a 12).",
    "write the year (4 digits) of each child or mark “I don't know”, and the month only if you know it (1 to 12)."],
  ["escribe el año o marca «No lo sé».", "write the year or mark “I don't know”."],
  ["el mes va de 1 a 12, o déjalo vacío.", "the month goes from 1 to 12, or leave it empty."],
  ["elige una opción.", "choose an option."],
  ["escribe el nombre del municipio o marca «No lo sé».", "write the name of the municipality or mark “I don't know”."],
  ["marca al menos una opción.", "mark at least one option."],
];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Modelli delle frasi con parti variabili (numeri, date, nomi): la traduzione può usare le parti catturate.
const PATRONES = [
  // Frasi composte dal codice con un'etichetta o un numero dentro (ultimo giro, coordinatore).
  [/^(.+): año \(4 cifras\)$/, (_, e) => `${enVoce(e)}: year (4 digits)`],
  [/^(.+): mes \(1 a 12, opcional\)$/, (_, e) => `${enVoce(e)}: month (1 to 12, optional)`],
  [/^1 hijo o hija$/, "1 son or daughter"],
  [/^(\d+) hijos o hijas$/, "$1 sons and daughters"],
  [/^Perfil cargado\. No hemos podido leer estos datos: (.+)\. Lo demás sí\.$/,
    (_, d) => `Profile loaded. We could not read these answers: ${d.split(", ").map(enVoce).join(", ")}. The rest was read.`],
  [/^Se muestran todas las áreas: (\d+) ayudas\.$/, "Showing all areas: $1 aid programmes."],
  [/^Se muestra (.+): (\d+) ayudas\.$/, (_, a, n) => `Showing ${enVoce(a)}: ${n} aid programmes.`],
  [/^Ordenado por: (.+)\.$/, (_, o) => `Sorted by: ${enVoceCI(o).toLowerCase()}.`],
  [/^en: (.+)\.$/, "at: $1."],
  [/^Pregunta (\d+)$/, "Question $1"],
  [/^Estás viendo un ejemplo con datos inventados de (.+)\.$/, "You are looking at an example with made-up data for $1."],
  [/^Perfil de ejemplo: (.+)\. Son datos inventados\.$/, "Example profile: $1. The data is made up."],
  [/^Hay (\d+) fichas en el catálogo publicado\.$/, "There are $1 cards in the published catalogue."],
  [R("Revisado por una persona el ", FE, "\\."), (_, f) => `Checked by a person on ${enFecha(f)}.`],
  [/^Con esta respuesta sabrás más sobre 1 ayuda$/, "With this answer you will learn about 1 more aid programme"],
  [/^Con esta respuesta sabrás más sobre (\d+) ayudas$/, "With this answer you will learn about $1 more aid programmes"],
  [/^Son (\d+) de las (\d+) que parecen encajar\. El resto está más abajo\.$/, "$1 of the $2 that seem to fit are shown. The rest is further down."],
  [/^Las (\d+) más importantes están arriba\.$/, "The $1 most important are at the top."],
  [/^Mostrando (\d+) de (\d+) ofertas\.$/, "Showing $1 of $2 offers."],
  // Scadenze e date delle schede (inizio, risultati).
  [R("Se abre el ", FE, ", plazo hasta el ", FE), (_, a, b) => `Opens on ${enFecha(a)}, deadline until ${enFecha(b)}`],
  [R("Se abre el ", FE), (_, a) => `Opens on ${enFecha(a)}`],
  [R("Plazo hasta el ", FE), (_, a) => `Deadline until ${enFecha(a)}`],
  [R("Abierta hasta el ", FE), (_, a) => `Open until ${enFecha(a)}`],
  [R("Cerrada el ", FE), (_, a) => `Closed on ${enFecha(a)}`],
  [R("Abre el ", FE), (_, a) => `Opens on ${enFecha(a)}`],
  [R("Leído por IA el ", FE, "\\."), (_, a) => `Read by AI on ${enFecha(a)}.`],
  [R("Lo estamos revisando: la fecha prevista para revisarla ya pasó \\(", FE, "\\)\\."),
    (_, a) => `We are reviewing it: the planned date for reviewing it has already passed (${enFecha(a)}).`],
  [R("Datos actualizados el ", FE, "\\."), (_, a) => `Data updated on ${enFecha(a)}.`],
  [R(FE), (_, a) => enFecha(a)],
  [R("Actualizado el ", FN, " a las (\\d{1,2}:\\d{2})\\."), (_, a, h) => `Updated on ${enFecha(a)} at ${h}.`],
  [R("Fuente: (.+?)(?: · publicada el ", FN, ")?"), (_, f, p) => `Source: ${f}${p ? ` · published on ${enFecha(p)}` : ""}`],
  // Importi: cifra in euro, periodicità.
  [R("(\\d[\\d.,]*) € al año"), (_, n) => `${n} € per year`],
  [R("(\\d[\\d.,]*) € al mes"), (_, n) => `${n} € per month`],
  [R("(\\d[\\d.,]*) €, pago único"), (_, n) => `${n} €, one-off payment`],
  [R("(\\d[\\d.,]*) € \\(variable\\)"), (_, n) => `${n} € (variable)`],
  // Date scritte solo con mese e anno, il municipio di un suggerimento, l'ora di un aggiornamento.
  [/^([a-záéíóú]+) de (\d{4})$/, (m, mes, anno) => (MESI_ES.includes(mes) ? `${MESI_EN[MESI_ES.indexOf(mes)]} ${anno}` : m)],
  [R("Datos actualizados el ", FE, ", (\\d{2}:\\d{2})\\."), (_, a, h) => `Data updated on ${enFecha(a)}, ${h}.`],
  [R("Escribe el nombre del municipio\\. Por ejemplo: (.+)\\."), (_, e) => `Write the name of the municipality. For example: ${e}.`],
  [R("Pregunta: (.+)"), (_, e) => `Question: ${enVoce(e)}`],
  // Conteggi di convocatorias e fichas (indice, risultati).
  [R("([\\d.,]+) (convocatorias?)(?:, se muestran ([\\d.,]+))?"), (_, n, c, m) =>
    `${n} ${c === "convocatoria" ? "call" : "calls"}${m ? `, showing ${m}` : ""}`],
  [R("Esta vista deja fuera ([\\d.,]+) de ([\\d.,]+) convocatorias: ([\\d.,]+) sin fechas en la fuente \\(plazo según las bases, pueden estar abiertas\\), ([\\d.,]+) que abren más adelante y ([\\d.,]+) cerradas\\. Están todas en «Todas»\\."),
    (_, a, b, c, d, e) => `This view leaves out ${a} of ${b} calls: ${c} with no dates in the source (the deadline is in the rules, they may be open), ${d} that open later and ${e} closed. All of them are under “All”.`],
  [R("Esta vista deja fuera ([\\d.,]+) de ([\\d.,]+) convocatorias, las que no tienen una fecha de apertura futura\\. Están todas en «Todas»\\."),
    (_, a, b) => `This view leaves out ${a} of ${b} calls, the ones without a future opening date. All of them are under “All”.`],
  [R("El índice guarda ([\\d.,]+) de ([\\d.,]+) convocatorias: quedan fuera ([\\d.,]+), las cerradas más antiguas\\."),
    (_, a, b, c) => `The index keeps ${a} of ${b} calls: ${c} are left out, the oldest closed ones.`],
  [R("Hay ([\\d.,]+) fichas de otros territorios que no se muestran\\."), (_, n) => `There are ${n} cards from other areas that are not shown.`],
  // Testi dei controlli del questionario (convalida, etichette di campo).
  [R("(.+): escribe un número o marca «No lo sé»\\."), (_, a) => `${enVoce(a)}: write a number or mark “I don't know”.`],
  [R("(.+): escribe un número entre (\\d+) y (\\d+)\\."), (_, a, lo, hi) => `${enVoce(a)}: write a number between ${lo} and ${hi}.`],
  [R("(.+): el año tiene 4 cifras y va de (\\d+) a (\\d+)\\."), (_, a, lo, hi) => `${enVoce(a)}: the year has 4 digits and goes from ${lo} to ${hi}.`],
  [R("(.+): la fecha no es válida o está en el futuro\\."), (_, a) => `${enVoce(a)}: the date is not valid or is in the future.`],
  [R("(.+): la fecha no es válida\\."), (_, a) => `${enVoce(a)}: the date is not valid.`],
  [R("(.+): El código del municipio tiene 5 cifras, o marca «No lo sé»\\."),
    (_, a) => `${enVoce(a)}: The municipality code has 5 digits, or mark “I don't know”.`],
  [R("(.+): elige una opción o «Prefiero no decirlo»\\."), (_, a) => `${enVoce(a)}: choose an option or “Prefer not to say”.`],
  [R("(.+): elige Sí, No o «No lo sé»\\."), (_, a) => `${enVoce(a)}: choose Yes, No or “I don't know”.`],
  [R("(.+): añade un país, marca «(.+)» o «No lo sé»\\."), (_, a, b) =>
    `${enVoce(a)}: add a country, mark “${enVoce(b)}” or “I don't know”.`],
  [R("(.+): añade un país o marca «No lo sé»\\."), (_, a) => `${enVoce(a)}: add a country or mark “I don't know”.`],
  [R("(.+): elige un país, «(.+)» o «No lo sé»\\."), (_, a, b) => `${enVoce(a)}: choose a country, “${enVoce(b)}” or “I don't know”.`],
  [R("(.+): elige un país o «No lo sé»\\."), (_, a) => `${enVoce(a)}: choose a country or “I don't know”.`],
  [R("(.+): la cifra debe ser un número entero de euros\\."), (_, a) => `${enVoce(a)}: the amount must be a whole number of euros.`],
  [R("(.+): elige un tramo o escribe la cifra\\."), (_, a) => `${enVoce(a)}: choose a band or write the amount.`],
  [R("(.+): marca «No tengo hijos que vivan conmigo o estén a mi cargo», añade cada hijo o marca «No lo sé»\\."), (_, a) =>
    `${enVoce(a)}: mark “I have no children living with me or in my care”, add each child or mark “I don't know”.`],
  [R("(.+): escribe el año \\(4 cifras, no posterior a (\\d+)\\) de cada hijo o marca «No lo sé», y el mes solo si lo sabes \\(1 a 12\\)\\."),
    (_, a, anio) => `${enVoce(a)}: write the year (4 digits, not after ${anio}) of each child or mark “I don't know”, and the month only if you know it (1 to 12).`],
  // Etichette dei pulsanti e delle aree con un nome dentro.
  [R("Ayuda: (.+)"), (_, a) => `Help: ${enVoce(a)}`],
  [R("Añadir a (.+)"), (_, a) => `Add to ${enVoceCI(a)}`],
  [R("Quitar (.+)"), (_, a) => `Remove ${enVoce(a)}`],
  [R("(.+), tramo"), (_, a) => `${enVoce(a)}, band`],
  [R("(.+), cifra exacta en euros"), (_, a) => `${enVoce(a)}, exact amount in euros`],
  [R("(.+): (leída|datos anteriores|sin datos), (\\d+) (convocatorias?), lectura del ", FN),
    (_, a, estado, n, c, f) => `${enVoce(a)}: ${{ "leída": "read", "datos anteriores": "earlier data", "sin datos": "no data" }[estado]}, ${n} ${c === "convocatoria" ? "call" : "calls"}, reading of ${enFecha(f)}`],
  // Liste, schede, plazos e note.
  [R("La BDNS dice: (.+)"), "The BDNS says: $1"],
  [R("Además, hay ([\\d.]+) plazas previstas en ([\\d.]+) (oferta|ofertas) de empleo público aprobadas\\. Están en la sección"),
    (_, a, b) => `In addition, ${a === "1" ? "there is 1 planned place" : `there are ${a} planned places`} in ${b} approved public-employment ${b === "1" ? "offer" : "offers"}. They are in the section`],
  [R("Ver detalles de (.+)"), (_, n) => `See details of ${enVoce(n)}`],
  [R("Ver más \\((\\d+) restantes\\)"), (_, n) => `See more (${n} remaining)`],
  [R("Ver más ofertas de (.+) \\((\\d+) restantes\\)"), (_, t, n) => `See more offers in ${enVoce(t)} (${n} remaining)`],
  [R("Hace (\\d+) días: pueden faltar ofertas o alguna ya no estar disponible\\."),
    (_, n) => `${n} days ago: offers may be missing, or some may no longer be available.`],
  [R("Lo que dices sobre cada requisito \\((\\d+)\\)"), (_, n) => `What you say about each requirement (${n})`],
  [R("Ver las otras (\\d+)"), (_, n) => `See the other ${n}`],
  [R("Ver las otras (\\d+) de (.+)"), (_, n, a) => `See the other ${n} in ${enVoce(a)}`],
  [R("Ver la otra de (.+)"), (_, a) => `See the other one in ${enVoce(a)}`],
  [R("Organismo: (.+)\\."), "Organisation: $1."],
  ...CONVALIDA.map(([es, en]) => [new RegExp("^([\\s\\S]+): " + esc(es) + "$"), (_, etiqueta) => `${enVoce(etiqueta)}: ${en}`]),
];

const ATTRIBUTI = ["placeholder", "title", "aria-label", "alt"];
const NON_TRADURRE = /^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/;
let osservatore = null;

// Una stringa spagnola con i suoi spazi ai bordi → la stessa con la traduzione, o null.
function traduci(testo) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(testo);
  const testoPulito = m[2];
  let en = MAPA.get(testoPulito);
  if (en === undefined) {
    const p = PATRONES.find(([re]) => re.test(testoPulito));
    if (p) en = testoPulito.replace(p[0], p[1]);
  }
  if (en === undefined && testoPulito.includes(", ")) {
    // Un elenco di voci del dizionario separate da virgole («Trabajo con contrato (por cuenta ajena), Estudio»).
    const parti = testoPulito.split(", ");
    if (parti.every((x) => MAPA.has(x.trim()))) en = parti.map((x) => MAPA.get(x.trim())).join(", ");
  }
  if (en === undefined) {
    // «Etichetta: valore»: l'etichetta (voce del dizionario) si traduce, il valore solo se è a sua volta una voce intera.
    const k = testoPulito.indexOf(": ");
    const etichetta = k > 0 ? testoPulito.slice(0, k) : "";
    const conDue = etichetta ? MAPA.get(etichetta + ":") : undefined;
    const base = conDue !== undefined ? conDue.replace(/:$/, "") : etichetta ? MAPA.get(etichetta) : undefined;
    if (base !== undefined) en = base + ": " + enVoce(testoPulito.slice(k + 2));
  }
  if (en === undefined && /:$/.test(testoPulito)) {
    // «Etichetta:» in un nodo a sé: il due punti resta uguale.
    const base = MAPA.get(testoPulito.slice(0, -1).trim());
    if (base !== undefined) en = base + ":";
  }
  return en === undefined ? null : m[1] + en + m[3];
}

// Per il codice che costruisce testi da sé (titolo della pagina, messaggi): restituisce la lingua giusta.
export function t(es) {
  if (LANG !== "en") return es;
  const r = traduci(es);
  return r === null ? es : r;
}

// Riscrive il testo e gli attributi dentro `radice`. Mentre scrive, l'osservatore è fermo.
export function traduciPagina(radice = document.body) {
  if (LANG !== "en" || !radice) return;
  osservatore?.disconnect();
  try {
    const nodi = document.createTreeWalker(radice, NodeFilter.SHOW_TEXT);
    const testi = [];
    while (nodi.nextNode()) testi.push(nodi.currentNode);
    for (const n of testi) {
      if (n.parentElement && NON_TRADURRE.test(n.parentElement.tagName)) continue;
      const r = traduci(n.nodeValue);
      if (r !== null && r !== n.nodeValue) n.nodeValue = r;
    }
    for (const el of radice.querySelectorAll("[placeholder],[title],[aria-label],[alt]")) {
      for (const a of ATTRIBUTI) {
        if (!el.hasAttribute(a)) continue;
        const r = traduci(el.getAttribute(a));
        if (r !== null) el.setAttribute(a, r);
      }
    }
  } finally {
    osservatore?.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTI });
  }
}

// Il selettore ES/EN porta con sé il frammento (#preguntas, #resultados): la pagina d'arrivo si apre sulla stessa sezione.
if (typeof document !== "undefined") {
  document.addEventListener("click", (e) => {
    const a = e.target instanceof Element ? e.target.closest(".selector-idioma a[hreflang]") : null;
    if (!a) return;
    const href = a.getAttribute("href") || "";
    a.setAttribute("href", href.split("#")[0] + location.hash);
  }, true);
}

// In inglese: carica il catalogo tradotto (le schede), traduce la pagina e segue i cambiamenti del DOM.
// Se il catalogo non si carica, la pagina resta comunque in inglese per tutto ciò che c'è nel dizionario.
export async function iniciarIdioma() {
  if (LANG !== "en") return;
  try {
    const res = await fetch(new URL("data/i18n-en.json", RAIZ));
    if (res.ok) {
      const catalogo = await res.json();
      for (const [k, v] of Object.entries(catalogo)) {
        if (typeof v === "string" && v) MAPA.set(k.trim(), v);
      }
    }
  } catch (e) {
    // senza catalogo tradotto restano le voci del dizionario
  }
  traduciPagina(document.body);
  osservatore = new MutationObserver(() => traduciPagina(document.body));
  osservatore.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTI });
}
