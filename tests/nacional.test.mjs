// Prove del lotto U2b: chi ha la cittadinanza spagnola (situacion_administrativa.tipo «nacional») non deve
// essere interrogato su «Residencia legal en España desde». Il motore non chiede la data (calc.*_residencia_legal
// passano), la schermata del documento non mostra quel campo, e nelle schede «Te falta un dato» non compare
// il link a quella domanda. Tutti i profili sono inventati.
//
//   node --test tests/nacional.test.mjs

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluar } from "../web/js/motor.js";
import { PANTALLAS, controlesVisibles, pantallasVisibles, camposUsados } from "../web/js/preguntas.js";

const RAIZ = new URL("../", import.meta.url);
const leer = (rel) => JSON.parse(readFileSync(new URL(rel, RAIZ), "utf8"));
const clona = (x) => JSON.parse(JSON.stringify(x));

const HOY = "2026-10-14";
const RESIDENCIA = "situacion_administrativa.residencia_legal_desde";
const FICHA_24 = leer("tests/fichas/es-prueba-residencia-24-meses.json");

const catalogoCon = (fichas) => ({
  esquema: "tamiz-catalogo", version: 1.1, actualizado_el: HOY, redactado_con_ia: true,
  revision_humana: { completa: false, por: null, el: null },
  fichas, ayuda_humana: [], grupos_paises: {},
});

// Un profilo minimo: persona e documento, senza data di residenza legale.
const perfil = (tipo, extra = {}) => ({
  esquema: "tamiz-perfil", version: 1.1,
  persona: { anio_nacimiento: 1990 },
  situacion_administrativa: { tipo, ...extra },
});

const voce = (res, id) => res.fichas.find((f) => f.id === id);

describe("cittadinanza spagnola: il motore non chiede la data di residenza", () => {
  test("nazionale senza data: la regola sulla durata passa, nessun dato mancante", () => {
    const cat = catalogoCon([clona(FICHA_24)]);
    const res = evaluar(cat, perfil("nacional"), HOY);
    const v = voce(res, "es-prueba-residencia-24-meses");
    assert.equal(v.estado, "encaja");
    assert.deepEqual(v.faltan, []);
    assert.equal(v.requisitos[0].resultado, "cumple");
    assert.equal(v.requisitos[0].motivo, null);
    assert.deepEqual(res.perfil_calculado["calc.anios_residencia_legal"], [Infinity, null]);
  });

  test("nazionale: nessun link alla domanda sulla data nelle schede (faltan senza il percorso)", () => {
    // Una scheda con più regole: una che dipende dalla data e una che manca d'altro.
    const ficha = clona(FICHA_24);
    ficha.id = "es-prueba-nacional-mixta";
    ficha.requisitos = [
      { campo: "calc.anios_residencia_legal", op: ">=", valor: 1, texto: "Un año de residencia" },
      { campo: "calc.edad", op: ">=", valor: 18, texto: "Mayor de edad" },
      { campo: "hogar.miembros", op: ">=", valor: 2, texto: "Dos personas en el hogar" },
    ];
    const res = evaluar(catalogoCon([ficha]), perfil("nacional"), HOY);
    const v = voce(res, "es-prueba-nacional-mixta");
    assert.equal(v.estado, "falta_dato");
    assert.deepEqual(v.faltan, ["hogar.miembros"]);
    assert.ok(!res.fichas.some((f) => f.faltan.includes(RESIDENCIA)));
  });

  test("nazionale con una data inserita prima: la durata non si legge più, la regola passa", () => {
    const cat = catalogoCon([clona(FICHA_24)]);
    const res = evaluar(cat, perfil("nacional", { residencia_legal_desde: "2026-06" }), HOY);
    assert.equal(voce(res, "es-prueba-residencia-24-meses").estado, "encaja");
  });

  test("nazionale: una regola che vuole poca durata non passa (il tetto è infinito, non zero)", () => {
    const ficha = clona(FICHA_24);
    ficha.id = "es-prueba-nacional-menos";
    ficha.requisitos = [{ campo: "calc.anios_residencia_legal", op: "<", valor: 5, texto: "Menos de 5 años" }];
    const res = evaluar(catalogoCon([ficha]), perfil("nacional"), HOY);
    assert.equal(voce(res, "es-prueba-nacional-menos").estado, "no_encaja");
  });

  test("straniero senza data: la data resta una domanda e il percorso compare fra i faltan", () => {
    const cat = catalogoCon([clona(FICHA_24)]);
    const res = evaluar(cat, perfil("ciudadano_ue"), HOY);
    const v = voce(res, "es-prueba-residencia-24-meses");
    assert.equal(v.estado, "falta_dato");
    assert.deepEqual(v.faltan, [RESIDENCIA]);
    assert.deepEqual(res.perfil_calculado["calc.anios_residencia_legal"], null);
  });
});

describe("cittadinanza spagnola: la schermata del documento non mostra la data", () => {
  const documento = PANTALLAS.find((p) => p.id === "documento");
  const usados = new Set([RESIDENCIA]);
  const campos = (p) => controlesVisibles(documento, p, usados).map((c) => c.campo);

  test("tipo nacional: «Residencia legal en España desde» è nascosta", () => {
    assert.ok(!campos(perfil("nacional")).includes(RESIDENCIA));
  });

  test("tipo ciudadano UE o residenza: la data si mostra (se una scheda la usa)", () => {
    assert.ok(campos(perfil("ciudadano_ue")).includes(RESIDENCIA));
    assert.ok(campos(perfil("residencia_temporal")).includes(RESIDENCIA));
    assert.ok(campos(perfil(undefined)).includes(RESIDENCIA));
  });

  test("con la sola cittadinanza spagnola la schermata resta visibile per il documento", () => {
    const visibili = pantallasVisibles(perfil("nacional"), usados).map((p) => p.id);
    assert.ok(visibili.includes("documento"));
  });

  test("camposUsados: il percorso resta usato dalle schede (la regola è nel motore, non nel campo nascosto)", () => {
    const cat = catalogoCon([clona(FICHA_24)]);
    assert.ok(camposUsados(cat).has(RESIDENCIA));
  });
});

// Chi è già spagnolo non riceve le schede della nazionalità per residenza: con la durata di
// residenza senza tetto per i nazionali, la scheda dei 2 anni dava «encaja» a uno spagnolo di
// origine iberoamericana (verifica U2b, 14/10/2026).
describe("cittadinanza spagnola: niente nazionalità per residenza", () => {
  const cat = JSON.parse(readFileSync(new URL("../web/data/catalogo.json", import.meta.url), "utf8"));
  const perfil = {
    esquema: "tamiz-perfil", version: 1.1,
    persona: { anio_nacimiento: 1990, nacionalidades: ["ES", "PY"] },
    residencia: { pais: "ES", region: "ES-VC", provincia: "ES-V", municipio: "València", empadronado_desde: "2015-01" },
    situacion_administrativa: { tipo: "nacional" },
    vinculos: { paises_origen: ["PY"] },
  };
  for (const id of ["es-nacionalidad-residencia-2-anos-iberoamericanos", "es-nacionalidad-residencia-10-anos"]) {
    test(`${id}: no encaja per chi è già spagnolo`, () => {
      const v = evaluar(cat, perfil, "2026-10-14").fichas.find((x) => x.id === id);
      assert.ok(v, `${id} manca nel catalogo`);
      assert.equal(v.estado, "no_encaja");
    });
  }
});
