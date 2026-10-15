// Punto d'ingresso: carica il catalogo, gestisce le sezioni (solo il nome nel frammento dell'URL), tiene lo stato in memoria.
// Il codice dell'app non scrive nulla nel browser e non chiama origini diverse da quella della pagina.
import { evaluar } from "./motor.js";
import { renderInicio } from "./ui/inicio.js";
import { renderCuestionario } from "./ui/cuestionario.js";
import { renderResultados } from "./ui/resultados.js";
import { renderPerfil, sanearPerfil } from "./ui/perfil.js";
import { renderAyuda, renderEmpleo } from "./ui/ayuda.js";
import { camposUsados, EJEMPLOS } from "./preguntas.js";
import { oggi } from "./ui/dom.js";
import { iniciarIdioma, RAIZ, t } from "./i18n.js";

const SECCIONES = ["inicio", "preguntas", "resultados", "perfil", "ayuda", "empleo"];
const RENDER = {
  inicio: renderInicio, preguntas: renderCuestionario, resultados: renderResultados,
  perfil: renderPerfil, ayuda: renderAyuda, empleo: renderEmpleo,
};
const ETIQUETA = { inicio: "Inicio", preguntas: "Preguntas", resultados: "Resultados", perfil: "Tu perfil",
  ayuda: "Ayuda humana", empleo: "Empleo" };

const estado = { catalogo: null, vigia: null, usados: new Set(), perfil: {}, pila: [], aviso: "", seccion: null };

const cargando = document.getElementById("cargando");

function contexto() {
  return {
    catalogo: estado.catalogo, vigia: estado.vigia, usados: estado.usados, perfil: estado.perfil, pila: estado.pila,
    hoy: oggi(), aviso: estado.aviso, evaluar,
    aplicar, ir, irPregunta, empezar, cargarEjemplo, render,
  };
}

function enfocaTitulo(seccion) {
  const titulo = document.getElementById(seccion).querySelector("h1");
  if (titulo) titulo.focus({ preventScroll: false });
}

// Riscrive la sezione attiva (senza cambiare pagina).
function render() {
  const seccion = estado.seccion;
  if (!seccion) return;
  const contenedor = document.getElementById(seccion);
  contenedor.replaceChildren(RENDER[seccion](contexto()));
  enfocaTitulo(seccion);
}

function mostrar(seccion, { foco = true } = {}) {
  const nueva = SECCIONES.includes(seccion) ? seccion : "inicio";
  if (nueva !== estado.seccion) estado.aviso = "";
  estado.seccion = nueva;
  for (const s of SECCIONES) {
    const nodo = document.getElementById(s);
    nodo.hidden = s !== nueva;
  }
  for (const a of document.querySelectorAll("header nav a")) {
    if (a.getAttribute("href") === `#${nueva}`) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  if (estado.catalogo) {
    document.title = tituloPagina(nueva);
    const contenedor = document.getElementById(nueva);
    contenedor.replaceChildren(RENDER[nueva](contexto()));
    if (foco) enfocaTitulo(nueva);
  }
}

function ir(seccion) {
  if (location.hash !== `#${seccion}`) {
    location.hash = seccion;
  } else {
    mostrar(seccion);
  }
}

function aplicar(nuevoPerfil, destino, opts = {}) {
  estado.perfil = nuevoPerfil;
  estado.aviso = opts.mensaje || "";
  if (destino === "resultados") { ir("resultados"); return; }
  render();
}

// Una domanda di fronte a un dato mancante: la pagina delle domande si apre su quella pantalla.
function irPregunta(id) {
  const i = estado.pila.indexOf(id);
  if (i >= 0) estado.pila.splice(i + 1);
  else estado.pila.push(id);
  ir("preguntas");
}

function empezar() {
  estado.pila.splice(0, estado.pila.length);
  ir("preguntas");
}

async function cargarEjemplo(nombre) {
  try {
    const res = await fetch(new URL(`data/${EJEMPLOS[nombre]}`, RAIZ));
    if (!res.ok) throw new Error(String(res.status));
    const r = sanearPerfil(await res.json());
    if (r.error) throw new Error(r.error);
    estado.perfil = r.perfil;
    estado.pila.splice(0, estado.pila.length);
    estado.aviso = "";
    ir("resultados");
  } catch (e) {
    estado.aviso = "No se pudo cargar el ejemplo. Inténtalo de nuevo.";
    ir("perfil");
  }
}

// Il titolo della pagina: l'inizio ha nome e lema (da sitio.json), le altre sezioni il nome e la sezione.
function tituloPagina(seccion) {
  const sitio = estado.catalogo?.sitio || {};
  const nombre = sitio.nombre || "Ayudas";
  if (seccion === "inicio") return sitio.lema ? `${nombre} · ${t(sitio.lema)}` : nombre;
  return `${nombre} · ${t(ETIQUETA[seccion])}`;
}

function cabecera(catalogo) {
  const nombre = catalogo.sitio?.nombre || "";
  const marca = document.getElementById("marca");
  marca.textContent = nombre;
}

// La vigía (data/vigia.json, generato al build): se manca o non si legge, il sito funziona come prima.
async function cargarVigia() {
  try {
    const res = await fetch(new URL("data/vigia.json", RAIZ));
    if (!res.ok) return null;
    const doc = await res.json();
    return doc && Array.isArray(doc.fichas) ? doc : null;
  } catch (e) {
    return null;
  }
}

async function arrancar() {
  await iniciarIdioma();
  const vigiaPendiente = cargarVigia(); // in parallelo al catalogo: non ritarda la pagina
  try {
    const res = await fetch(new URL("data/catalogo.json", RAIZ));
    if (!res.ok) throw new Error(String(res.status));
    estado.catalogo = await res.json();
  } catch (e) {
    cargando.textContent = "No se pudo cargar el catálogo. Recarga la página dentro de un rato.";
    return;
  }
  estado.vigia = await vigiaPendiente;
  estado.usados = camposUsados(estado.catalogo);
  cabecera(estado.catalogo);
  cargando.remove();
  window.addEventListener("hashchange", () => { mostrarDesdeHash(true); });
  mostrarDesdeHash(false); // al primo caricamento niente focus: il riquadro blu sul titolo non è atteso
}

// Il calendario (calendario.ics) porta a index.html#ficha-<id>: si apre Resultados sulla scheda.
// `foco` è true solo quando il frammento cambia mentre la pagina è aperta (navigazione dal menu).
function mostrarDesdeHash(foco) {
  const hash = location.hash.slice(1);
  if (hash.startsWith("ficha-")) {
    mostrar("resultados", { foco: false });
    irAFicha(hash);
    return;
  }
  mostrar(hash || "inicio", { foco });
}

function irAFicha(id) {
  const nodo = document.getElementById(id);
  if (!nodo) return;
  for (let p = nodo.parentElement; p; p = p.parentElement) {
    if (p.tagName === "DETAILS") p.open = true; // la scheda può stare in «Ver las otras…»
  }
  nodo.scrollIntoView({ block: "start" });
}

arrancar();
