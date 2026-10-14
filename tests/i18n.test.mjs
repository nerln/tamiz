// Prove della lingua inglese (lotto L37): dizionario es→en, pagine in web/en/, selettore e hreflang.
// Nessuna rete, nessun browser: legge i file del repo.
//
//   node --test            (dalla radice del repo)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const RADICE = new URL("..", import.meta.url).pathname;
const WEB = join(RADICE, "web");

describe("dizionario dell'interfaccia (web/js/i18n-dic.js)", async () => {
  const { DIC } = await import(join(WEB, "js", "i18n-dic.js"));
  const voci = Object.entries(DIC);

  test("ogni voce ha una traduzione inglese non vuota", () => {
    assert.ok(voci.length > 300, "dizionario troppo corto");
    for (const [es, en] of voci) {
      assert.equal(typeof en, "string", `traduzione mancante per «${es}»`);
      assert.ok(en.trim().length > 0, `traduzione vuota per «${es}»`);
    }
  });

  test("le chiavi senza spazi ai bordi non cambiano il significato", () => {
    const viste = new Map();
    for (const [es, en] of voci) {
      const k = es.trim();
      if (viste.has(k)) assert.equal(viste.get(k), en.trim(), `traduzioni diverse per «${k}»`);
      viste.set(k, en);
    }
  });

  test("gli esiti delle schede sono in inglese come da specifica", () => {
    assert.equal(DIC["Parece que encajas"], "Looks like a match");
    assert.equal(DIC["Te falta un dato"], "Missing information");
    assert.equal(DIC["No encaja"], "Not a match");
  });
});

describe("pagine inglesi (web/en/)", () => {
  const spagnole = readdirSync(WEB).filter((n) => n.endsWith(".html"));
  const inglesi = existsSync(join(WEB, "en")) ? readdirSync(join(WEB, "en")).filter((n) => n.endsWith(".html")) : [];

  test("ci sono le stesse pagine in inglese", () => {
    assert.deepEqual([...inglesi].sort(), [...spagnole].sort());
  });

  for (const n of spagnole) {
    test(`${n}: lang, selettore e hreflang`, () => {
      const es = readFileSync(join(WEB, n), "utf8");
      const en = readFileSync(join(WEB, "en", n), "utf8");
      assert.match(es, /<html[^>]*lang="es"/);
      assert.match(en, /<html[^>]*lang="en"/);
      for (const t of [es, en]) {
        assert.match(t, /hreflang="es"/);
        assert.match(t, /hreflang="en"/);
        assert.match(t, /class="selector-idioma"/);
      }
      assert.match(en, /href="\.\.\/css\//, "le pagine inglesi caricano i css dalla radice");
    });
  }

  test("la sitemap elenca le pagine inglesi", () => {
    const sm = readFileSync(join(WEB, "sitemap.xml"), "utf8");
    assert.match(sm, /tamiz\/en\/"/);
    assert.match(sm, /tamiz\/en\/privacidad\.html/);
  });
});
