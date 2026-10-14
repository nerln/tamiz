// La pagina di apertura: che cos'è, cosa non è, i prossimi plazos con data e area, i link alle altre pagine.
import { el, fechaLarga, giorniTra, esFinTecnico, sinFinTecnicoEn, simbolo, areaValida, nombreArea } from "./dom.js";

export function renderInicio(ctx) {
  const { catalogo, hoy } = ctx;
  const sitio = catalogo.sitio || {};
  // Próximos plazos: apertura o chiusura entro 60 giorni (docs/ESQUEMA.md, «Contrato de evaluar()»).
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
      return `Se abre el ${fechaLarga(inicio)}${esFinTecnico(fin) ? "" : `, plazo hasta el ${fechaLarga(fin)}`}`;
    }
    return `Plazo hasta el ${fechaLarga(fin)}`;
  };
  const vocePlazo = (f) => el("li", { class: "plazo-item" },
    el("span", { class: "etiqueta-area", text: nombreArea(areaValida(f.area)) }),
    el("span", { class: "plazo-nombre", text: f.nombre }),
    el("span", { class: "plazo-fecha", text: textoCambio(f) }));

  const avisos = [
    el("li", { text: "Versión de prueba." }),
    el("li", { text: "No es asesoramiento: es una orientación según lo que nos digas." }),
  ];
  if (!catalogo.revision_humana || catalogo.revision_humana.completa !== true) {
    avisos.push(el("li", { text: "Fichas redactadas con IA, sin revisión humana todavía." }));
  }
  const vieja = giorniTra(catalogo.actualizado_el, hoy) > 30;
  const acceso = (href, titulo, texto) => el("li", null,
    el("a", { class: "acceso", href }, el("span", { class: "acceso-titulo", text: titulo }),
      el("span", { class: "acceso-texto", text: texto })));

  return sinFinTecnicoEn(el("div", { class: "inicio" },
    el("section", { class: "portada", "aria-labelledby": "titulo-inicio" },
      el("div", { class: "portada-texto" },
        el("p", { class: "antetitulo", text: "España y Comunitat Valenciana" }),
        el("h1", { tabindex: -1, id: "titulo-inicio", text: sitio.lema || sitio.nombre || "" }),
        el("p", { class: "frase", text: "Contesta unas preguntas sencillas y te enseñamos qué ayudas, becas y trámites podrían encajar contigo." }),
        el("p", { class: "intro" }, "No decide nada, no es asesoramiento y no sustituye a la convocatoria oficial. ",
          "Tus respuestas no salen de este navegador."),
        el("div", { class: "acciones acciones-portada" },
          el("button", { type: "button", class: "principal grande", text: "Empezar", onclick: () => ctx.empezar() })),
        el("div", { class: "ejemplos" },
          el("p", { class: "ejemplos-titulo", id: "ejemplos-titulo", text: "¿Prefieres ver antes cómo funciona? Mira un ejemplo con datos inventados:" }),
          el("div", { class: "acciones", role: "group", "aria-labelledby": "ejemplos-titulo" },
            el("button", { type: "button", class: "secundario", text: "Ver el ejemplo de Lucía",
              onclick: () => ctx.cargarEjemplo("lucia") }),
            el("button", { type: "button", class: "secundario", text: "Ver el ejemplo de Rodrigo",
              onclick: () => ctx.cargarEjemplo("rodrigo") })))),
      el("div", { class: "portada-figura", "aria-hidden": "true" }, simbolo("simbolo simbolo-portada"))),

    el("section", { class: "pasos", "aria-labelledby": "como-funciona" },
      el("h2", { id: "como-funciona", text: "Cómo funciona" }),
      el("ol", { class: "lista-pasos" },
        el("li", null, el("strong", { text: "Respondes" }), " a unas preguntas sobre tu situación. Si no sabes algo, marca «No lo sé»."),
        el("li", null, el("strong", { text: "Comparamos" }), " tus respuestas con los requisitos escritos en cada ficha."),
        el("li", null, el("strong", { text: "Ves" }), " qué parece encajar, qué dato falta y dónde pedirlo en la página oficial."))),

    el("section", { class: "caja plazos", "aria-labelledby": "proximos-plazos" },
      el("h2", { id: "proximos-plazos", text: "Próximos plazos" }),
      el("p", { class: "pequeno", text: "Convocatorias que se abren o se cierran en los próximos 60 días." }),
      proximos.length
        ? el("ul", { class: "lista-plazos" }, proximos.map(({ f }) => vocePlazo(f)))
        : el("p", { text: "No hay plazos que se abran o cierren en los próximos 60 días." })),

    el("nav", { class: "accesos-bloque", "aria-labelledby": "mas-para-consultar" },
      el("h2", { id: "mas-para-consultar", text: "Más para consultar" }),
      el("ul", { class: "accesos" },
        acceso("indice.html", "Todas las convocatorias", "Índice automático de convocatorias públicas, con buscador. Sin revisar: no evaluamos si encajan contigo."),
        acceso("empleo.html", "Ofertas de empleo", "Ofertas de terceros, sin verificar. No son ayudas."),
        acceso("#ayuda", "Ayuda humana gratuita", "Entidades que orientan en persona y sin coste."))),

    el("section", { class: "caja aviso", "aria-labelledby": "avisos" },
      el("h2", { id: "avisos", text: "Antes de empezar" }),
      el("ul", null, avisos)),
    el("p", { class: `fecha-datos${vieja ? " vieja" : ""}` },
      el("span", { class: "etiqueta-pequena", text: "Catálogo actualizado el" }), " ",
      el("strong", { text: fechaLarga(catalogo.actualizado_el) }),
      vieja ? el("span", { class: "aviso-vieja", text: " (hace más de 30 días: pueden estar desactualizados)" }) : null)));
}
