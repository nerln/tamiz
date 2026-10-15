// Prova del riquadro della vigía nelle schede dei risultati (lotto L40): compare solo con aviso_publico.
// Nessun browser: un DOM minimo finto, sufficiente per i nodi che costruisce el() in ui/dom.js.
//
//   node --test            (dalla radice del repo)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

class FakeNode {
  constructor() { this.childNodes = []; }
  appendChild(n) { this.childNodes.push(n); return n; }
}
class FakeElement extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.attributes = {};
    this.textContent = "";
  }
  setAttribute(k, v) { this.attributes[k] = v; }
  addEventListener() {}
}
class FakeText extends FakeNode {
  constructor(testo) { super(); this.textContent = testo; }
}
// Il modulo i18n.js legge document solo se esiste; el() usa createElement, createTextNode e Node.
globalThis.Node = FakeNode;
globalThis.document = {
  documentElement: { lang: "es" },
  createElement: (tag) => new FakeElement(tag),
  createTextNode: (testo) => new FakeText(testo),
  addEventListener() {},
};

const RADICE = new URL("..", import.meta.url).pathname;
const { avisoVigia, AVISO_VIGIA } = await import(join(RADICE, "web", "js", "ui", "resultados.js"));
const { DIC } = await import(join(RADICE, "web", "js", "i18n-dic.js"));

const vigia = {
  generado_el: "2026-10-15",
  total_fichas: 3,
  con_senales: 2,
  fichas: [
    { id: "con-aviso", nombre: "Ayuda A", senales: [{ tipo: "revision_vencida", detalle: "x" }], aviso_publico: true },
    { id: "solo-plazo", nombre: "Ayuda B", senales: [{ tipo: "plazo_pasado", detalle: "y" }], aviso_publico: false },
  ],
  no_comprobadas: [],
};

describe("riquadro della vigía (web/js/ui/resultados.js)", () => {
  test("compare solo per una scheda con aviso_publico", () => {
    assert.notEqual(avisoVigia(vigia, "con-aviso"), null);
    assert.equal(avisoVigia(vigia, "solo-plazo"), null);
    assert.equal(avisoVigia(vigia, "senza-segnali"), null);
  });

  test("senza dati della vigía nessun riquadro e nessun errore", () => {
    assert.equal(avisoVigia(null, "con-aviso"), null);
    assert.equal(avisoVigia(undefined, "con-aviso"), null);
    assert.equal(avisoVigia({}, "con-aviso"), null);
    assert.equal(avisoVigia({ fichas: "non è una lista" }, "con-aviso"), null);
    assert.equal(avisoVigia({ fichas: [null, { id: "x" }] }, "con-aviso"), null);
  });

  test("la riga è un paragrafo con la classe di un avviso esistente e il testo previsto", () => {
    const riga = avisoVigia(vigia, "con-aviso");
    assert.equal(riga.tagName, "P");
    assert.equal(riga.attributes.class, "aviso-revisar");
    assert.equal(riga.textContent, AVISO_VIGIA);
    assert.equal(AVISO_VIGIA, "Puede haber cambiado desde nuestra última revisión. Comprueba la fuente oficial antes de pedirla.");
  });

  test("la classe aviso-revisar esiste nel CSS della pagina", () => {
    const css = readFileSync(join(RADICE, "web", "css", "estilo.css"), "utf8");
    assert.match(css, /\.aviso-revisar\s*\{/);
  });

  test("il testo ha la traduzione inglese prevista nel dizionario", () => {
    assert.equal(DIC[AVISO_VIGIA],
      "This may have changed since our last review. Check the official source before you apply.");
  });

  test("il testo non usa le parole vietate", () => {
    assert.doesNotMatch(AVISO_VIGIA, /cumples|te\s+toca|tienes\s+derecho/i);
    assert.doesNotMatch(DIC[AVISO_VIGIA], /cumples|te\s+toca|tienes\s+derecho/i);
  });
});
