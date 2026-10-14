// Tu perfil: il riepilogo, il salvataggio sul dispositivo, il caricamento con controllo minimo, il cancellamento.
import { el, fechaLarga } from "./dom.js";
import { PANTALLAS, PAISES, TRAMOS, leer, escribir } from "../preguntas.js";
import { prefieroNoDecirloIngreso } from "./cuestionario.js";

const RE_PAIS = /^[A-Z]{2}$/;
const RE_FECHA = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
const INDET = "no_lo_se";
// Per un tramo di reddito il codice ammesso è «no_lo_se» (docs/ESQUEMA.md §2.5); la scheda ne dà «Te falta un dato».
// «prefiero_no_decirlo» nei file caricati si legge come «no_lo_se»: non è un codice di tramo.
const TRAMO_ETIQUETAS = [...TRAMOS, ["no_lo_se", "No lo sé"]];

function fechaValida(s) {
  const m = RE_FECHA.exec(s);
  if (!m) return false;
  if (m[2] === undefined) return true;
  const mo = +m[2];
  if (mo < 1 || mo > 12) return false;
  if (m[3] === undefined) return true;
  const d = +m[3];
  return d >= 1 && d <= new Date(Date.UTC(+m[1], mo, 0)).getUTCDate();
}

function valorValido(c, v) {
  if (v === INDET) return true;
  switch (c.tipo) {
    case "anio": return Number.isInteger(v) && v >= (c.min ?? 1900) && v <= (c.max ?? 2100);
    case "entero": return Number.isInteger(v) && v >= c.min && v <= c.max;
    case "fecha": return typeof v === "string" && fechaValida(v);
    case "texto": return typeof v === "string" && /^\d{5}$/.test(v);
    case "bool": return typeof v === "boolean";
    case "select":
      if (c.campo.endsWith("mes_nacimiento")) return Number.isInteger(v) && v >= 1 && v <= 12;
      return typeof v === "string" && c.opciones.some(([k]) => k === v);
    case "radio": return typeof v === "string" && (c.opciones.some(([k]) => k === v) || RE_PAIS.test(v));
    case "pais": return typeof v === "string" && RE_PAIS.test(v);
    case "paises": return Array.isArray(v) && v.every((x) => typeof x === "string" && RE_PAIS.test(x));
    case "lista": return Array.isArray(v) && v.every((x) => typeof x === "string" && c.opciones.some(([k]) => k === x));
    case "hijos": return Array.isArray(v) && v.length <= 20 && v.every((h) => h && typeof h === "object"
      && (h.anio_nacimiento === INDET || (Number.isInteger(h.anio_nacimiento) && h.anio_nacimiento >= 1900 && h.anio_nacimiento <= 2100))
      && (h.mes_nacimiento === INDET || (Number.isInteger(h.mes_nacimiento) && h.mes_nacimiento >= 1 && h.mes_nacimiento <= 12)));
    default: return false;
  }
}

// Controllo minimo al caricamento: tiene i campi validi, scarta gli altri e dice quali (§5.6).
export function sanearPerfil(datos) {
  const descartados = [];
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    return { error: "Este archivo no es un perfil de este sitio." };
  }
  if (datos.esquema !== "tamiz-perfil") return { error: "Este archivo no es un perfil de este sitio." };
  if (datos.version !== 1.1) return { error: "Este perfil tiene una versión que esta página no conoce." };
  let nuevo = {};
  const vistos = new Set();
  for (const p of PANTALLAS) {
    for (const c of p.controles) {
      const ruta = c.campo || c.base;
      if (vistos.has(ruta)) continue;
      vistos.add(ruta);
      if (c.tipo === "tramo") {
        const obj = leer(datos, c.base);
        if (obj === undefined) continue;
        const tramo = obj && typeof obj === "object" && obj.tramo === "prefiero_no_decirlo" ? INDET
          : obj && typeof obj === "object" ? obj.tramo : undefined;
        const tramoOk = obj && typeof obj === "object" && (tramo === undefined || tramo === INDET
          || TRAMOS.some(([k]) => k === tramo));
        const impOk = obj && typeof obj === "object" && (obj.importe === undefined || obj.importe === INDET
          || (Number.isInteger(obj.importe) && obj.importe >= 0));
        if (tramoOk && impOk && obj && typeof obj === "object") {
          if (tramo !== undefined) nuevo = escribir(nuevo, `${c.base}.tramo`, tramo);
          if (obj.importe !== undefined) nuevo = escribir(nuevo, `${c.base}.importe`, obj.importe);
        } else {
          descartados.push(c.etiqueta);
        }
        continue;
      }
      const v = leer(datos, ruta);
      if (v === undefined || v === null) continue;
      if (valorValido(c, v)) nuevo = escribir(nuevo, ruta, v);
      else descartados.push(c.etiqueta);
    }
  }
  if (datos.ingresos && datos.ingresos.ejercicio !== undefined && Number.isInteger(datos.ingresos.ejercicio)) {
    nuevo = escribir(nuevo, "ingresos.ejercicio", datos.ingresos.ejercicio);
  }
  if (datos.ejemplo && typeof datos.ejemplo === "object" && typeof datos.ejemplo.nombre_ficticio === "string") {
    nuevo = escribir(nuevo, "ejemplo", { nombre_ficticio: datos.ejemplo.nombre_ficticio,
      descripcion: typeof datos.ejemplo.descripcion === "string" ? datos.ejemplo.descripcion : "",
      sintetico: true });
  }
  return { perfil: nuevo, descartados: [...new Set(descartados)] };
}

function etiquetaCodigo(opciones, v) {
  const hit = (opciones || []).find(([k]) => k === v);
  return hit ? hit[1] : String(v);
}

function formatea(c, v, perfil) {
  if (v === INDET) return "No lo sé";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (c.tipo === "tramo") {
    const obj = leer(perfil, c.base) || {};
    if (obj.importe !== undefined) return `${obj.importe} € al año`;
    // Come nel questionario: «Prefiero no decirlo» ricordato sull'oggetto del reddito (vedi cuestionario.js).
    return prefieroNoDecirloIngreso(obj) ? "Prefiero no decirlo" : etiquetaCodigo(TRAMO_ETIQUETAS, obj.tramo);
  }
  if (c.tipo === "hijos") return v.length ? `${v.length} ${v.length === 1 ? "hijo o hija" : "hijos o hijas"}` : "Ninguno";
  if (Array.isArray(v)) {
    if (!v.length) return c.nadie ? c.nadie[1] : "Ninguno";
    return v.map((x) => (c.opciones ? etiquetaCodigo(c.opciones, x) : etiquetaCodigo(PAISES, x))).join(", ");
  }
  if (c.tipo === "paises" || c.tipo === "pais") return etiquetaCodigo(PAISES, v);
  if (c.opciones) return etiquetaCodigo(c.opciones, v);
  return String(v);
}

export function renderPerfil(ctx) {
  const perfil = ctx.perfil;
  const vacio = Object.keys(perfil).length === 0;
  const lineas = [];
  const visto = new Set();
  for (const p of PANTALLAS) {
    for (const c of p.controles) {
      const ruta = c.campo || c.base;
      if (c.si && !c.si(perfil)) continue;
      const v = c.tipo === "tramo" ? leer(perfil, c.base) : leer(perfil, c.campo);
      if (v === undefined || v === null || (c.tipo === "tramo" && (!v.tramo && v.importe === undefined))) continue;
      if (c.opciones && typeof v === "string" && !c.opciones.some(([k]) => k === v) && !/^[A-Z]{2}$/.test(v)) continue;
      if (visto.has(ruta)) continue;
      visto.add(ruta);
      lineas.push(el("li", null, el("span", { class: "linea-etiqueta", text: c.etiqueta + ": " }),
        el("span", { text: formatea(c, v, perfil) })));
    }
  }
  const aviso = perfil.ejemplo ? el("p", { class: "aviso-ejemplo" }, `Perfil de ejemplo: ${perfil.ejemplo.nombre_ficticio || ""}. Son datos inventados.`) : null;
  const mensaje = el("p", { class: "mensaje", role: "status", "aria-live": "polite", text: ctx.aviso || "" });
  const entrada = el("input", { type: "file", accept: "application/json,.json", class: "sr-only", id: "cargar-perfil",
    "aria-label": "Cargar un perfil guardado" });
  entrada.addEventListener("change", async () => {
    const archivo = entrada.files && entrada.files[0];
    entrada.value = "";
    if (!archivo) return;
    let datos;
    try { datos = JSON.parse(await archivo.text()); } catch (e) {
      mensaje.textContent = "Este archivo no se puede leer: no es un JSON válido.";
      return;
    }
    const r = sanearPerfil(datos);
    if (r.error) { mensaje.textContent = r.error; return; }
    ctx.aplicar(r.perfil, "perfil", {
      mensaje: r.descartados.length
        ? `Perfil cargado. No hemos podido leer estos datos: ${r.descartados.join(", ")}. Lo demás sí.`
        : "Perfil cargado.",
    });
  });
  const guardar = el("button", { type: "button", class: "principal", text: "Guardar en tu dispositivo",
    onclick: () => {
      const salida = { esquema: "tamiz-perfil", version: 1.1, actualizado_el: ctx.hoy, ...perfil };
      const blob = new Blob([JSON.stringify(salida, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = el("a", { href: url, download: "perfil.json" });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      mensaje.textContent = "Archivo perfil.json preparado para guardar.";
    } });
  const borrar = el("button", { type: "button", class: "secundario peligro", text: "Borrar todo",
    onclick: () => {
      if (!window.confirm("Se borran todas tus respuestas de esta página. Si no has guardado el archivo, no podrás recuperarlas. ¿Seguro?")) return;
      ctx.pila.splice(0, ctx.pila.length); // anche la pila delle domande: il menu «Preguntas» riparte dalla prima
      ctx.aplicar({}, "perfil", { mensaje: "Todo borrado." });
    } });
  return el("div", { class: "perfil" },
    el("header", { class: "cabecera-seccion" },
      el("h1", { tabindex: -1, id: "titulo-perfil", text: "Tu perfil" }),
      el("p", { text: "Aquí ves lo que has contestado. Puedes guardarlo en un archivo para seguir otro día, o cargar uno que ya tengas." })),
    aviso,
    vacio
      ? el("p", { class: "vacio" }, "Todavía no hay respuestas. ", el("a", { href: "#preguntas", text: "Empezar las preguntas" }))
      : el("ul", { class: "resumen-perfil" }, lineas),
    el("p", { class: "aviso" }, "Tus respuestas no salen de este navegador: no las enviamos a ningún servidor. ",
      "El archivo que guardas contiene tus respuestas: guárdalo donde quieras y no lo compartas con quien no lo necesite."),
    el("div", { class: "acciones" }, guardar,
      el("label", { class: "boton secundario", for: "cargar-perfil" }, "Cargar un perfil", entrada),
      vacio ? null : borrar),
    mensaje);
}
