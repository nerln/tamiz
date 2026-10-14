// La pagina di apertura: che cos'è, cosa non è, i cambi con data, gli avvisi, la data dei dati.
import { el, fechaLarga, giorniTra, esFinTecnico, sinFinTecnicoEn } from "./dom.js";

export function renderInicio(ctx) {
  const { catalogo, hoy } = ctx;
  const sitio = catalogo.sitio || {};
  // Cambios con fecha: apertura o chiusura entro 60 giorni (docs/ESQUEMA.md, «Contrato de evaluar()»).
  // Una fine tecnica (dal 2099) non è una chiusura: la scheda entra qui solo per la sua apertura, che è oggi o dopo.
  const entro60 = (d) => typeof d === "string" && d >= hoy && giorniTra(hoy, d) <= 60;
  const proximos = (catalogo.fichas || [])
    .filter((f) => f.plazo && f.plazo.tipo === "fechas" && f.plazo.fin && hoy <= f.plazo.fin
      && (entro60(f.plazo.inicio) || (!esFinTecnico(f.plazo.fin) && entro60(f.plazo.fin))))
    .map((f) => ({ f, cuando: entro60(f.plazo.inicio) ? f.plazo.inicio : f.plazo.fin }))
    .sort((a, b) => (a.cuando < b.cuando ? -1 : a.cuando > b.cuando ? 1 : 0));
  // «se abre el …» per un'apertura da oggi in poi (anche oggi stesso); la fine si dice solo se è una data vera.
  // Una fine tecnica non compare mai: con inicio >= hoy la frase è sempre «se abre el …».
  const textoCambio = (f) => {
    const { inicio, fin } = f.plazo;
    if (typeof inicio === "string" && inicio >= hoy) {
      return `${f.nombre}: se abre el ${fechaLarga(inicio)}${esFinTecnico(fin) ? "" : `, plazo hasta el ${fechaLarga(fin)}`}`;
    }
    return `${f.nombre}: plazo hasta el ${fechaLarga(fin)}`;
  };
  const avisos = [
    el("li", { text: "Versión de prueba." }),
    el("li", { text: "No es asesoramiento: es una orientación según lo que nos digas." }),
  ];
  if (!catalogo.revision_humana || catalogo.revision_humana.completa !== true) {
    avisos.push(el("li", { text: "Fichas redactadas con IA, sin revisión humana todavía." }));
  }
  const vieja = giorniTra(catalogo.actualizado_el, hoy) > 30;
  return sinFinTecnicoEn(el("div", { class: "inicio" },
    el("header", { class: "cabecera-seccion" },
      el("h1", { tabindex: -1, id: "titulo-inicio", text: sitio.nombre || "" }),
      el("p", { class: "lema", text: sitio.lema || "" })),
    el("p", { class: "intro" }, "Te ayudamos a ver qué ayudas y becas podrían encajar contigo, según lo que nos digas. ",
      "No decide nada, no es asesoramiento y no sustituye a la convocatoria oficial. ",
      "Tus respuestas no salen de este navegador."),
    el("div", { class: "acciones" },
      el("button", { type: "button", class: "principal", text: "Empezar", onclick: () => ctx.empezar() }),
      el("button", { type: "button", class: "secundario", text: "Ver el ejemplo de Lucía",
        onclick: () => ctx.cargarEjemplo("lucia") }),
      el("button", { type: "button", class: "secundario", text: "Ver el ejemplo de Rodrigo",
        onclick: () => ctx.cargarEjemplo("rodrigo") })),
    el("section", { class: "caja", "aria-labelledby": "cambios-fecha" },
      el("h2", { id: "cambios-fecha", text: "Cambios con fecha" }),
      proximos.length
        ? el("ul", null, proximos.map(({ f }) => el("li", { text: textoCambio(f) })))
        : el("p", { text: "No hay plazos que se abran o cierren en los próximos 60 días." })),
    el("section", { class: "caja aviso", "aria-labelledby": "avisos" },
      el("h2", { id: "avisos", text: "Antes de empezar" }),
      el("ul", null, avisos)),
    el("p", { class: `fecha-datos${vieja ? " vieja" : ""}` },
      el("span", { class: "etiqueta-pequena", text: "Catálogo actualizado el" }), " ",
      el("strong", { text: fechaLarga(catalogo.actualizado_el) }),
      vieja ? el("span", { class: "aviso-vieja", text: " (hace más de 30 días: pueden estar desactualizados)" }) : null)));
}
