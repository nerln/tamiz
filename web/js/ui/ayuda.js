// Ayuda humana ed Empleo: solo link e testo; niente dati della persona.
import { el, fechaLarga } from "./dom.js";

export function renderAyuda(ctx) {
  const lista = ctx.catalogo.ayuda_humana || [];
  return el("div", { class: "pagina-ayuda" },
    el("header", { class: "cabecera-seccion" },
      el("h1", { tabindex: -1, id: "titulo-ayuda", text: "Ayuda humana" }),
      el("p", { text: "Personas y organizaciones que pueden orientarte de forma gratuita. No somos nosotros, y no tienes que dar datos personales para ver esta lista." })),
    lista.length
      ? el("ul", { class: "lista-ayuda" }, lista.map((a) => el("li", { class: "tarjeta-ayuda" },
        el("h2", { text: a.nombre }),
        el("p", { text: a.que_hace }),
        a.para_quien ? el("p", { class: "para-quien", text: `Para: ${a.para_quien}` }) : null,
        el("p", { class: "etiqueta-pequena", text: a.gratuito ? "Gratuito" : "Consulta el coste" }),
        el("p", null, el("a", { href: a.url, rel: "noopener", text: "Página de la entidad" })),
        el("p", { class: "fuente", text: a.verificado_el ? `Revisado por una persona el ${fechaLarga(a.verificado_el)}.` : "Revisado por una persona: todavía no." }))))
      : el("p", { class: "vacio", text: "Todavía no hay entidades en la lista." }));
}

export function renderEmpleo() {
  return el("div", { class: "pagina-empleo" },
    el("header", { class: "cabecera-seccion" },
      el("h1", { tabindex: -1, id: "titulo-empleo", text: "Empleo" }),
      el("p", { text: "Estos enlaces llevan a ofertas de terceros, no son derechos ni garantías de nada. Revisa siempre la oferta en la web de quien la publica." })),
    el("ul", { class: "lista-enlaces-grandes" },
      el("li", null, el("a", { href: "https://empleate.gob.es/empleo/", rel: "noopener", text: "Empléate" })),
      el("li", null, el("a", { href: "https://labora.gva.es/", rel: "noopener", text: "Punt LABORA" })),
      el("li", null, el("a", { href: "https://euraxess.ec.europa.eu/jobs/search", rel: "noopener", text: "EURAXESS (investigación)" })),
      el("li", null, el("a", { href: "empleo.html", text: "Ofertas de empleo" }))));
}
