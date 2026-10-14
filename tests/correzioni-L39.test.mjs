// Prove del lotto L39 sul questionario: risposte delle schermate nascoste (punto 8), situazioni incompatibili e «No trabajo»
// (punto 9), residenza dopo «Quitar respuesta» (punto 10). Dalla radice della copia: node --test tests/*.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import * as P from "../web/js/preguntas.js";

const control = (pantalla, campo) => P.PANTALLAS.find((p) => p.id === pantalla).controles.find((c) => c.campo === campo);
const HOY = "2026-10-15";

describe("punto 8: le risposte delle schermate nascoste non restano nel profilo", () => {
  const pensionista = {
    persona: { anio_nacimiento: 1958 },
    residencia: { pais: "ES", region: "ES-VC", provincia: "V", municipio: "València", municipio_ine: "46250", empadronado_desde: "2000" },
    empleo: { situaciones: ["jubilado"], tipo_contrato: "indefinido", cobra_prestacion: true, meses_cotizados_6_anios: 40 },
    vinculos: { entidad_trabajo: { tipo: "empresa", ambito: "ES-VC" } },
  };
  test("un pensionato che prima aveva scelto asalariado perde entidad_trabajo, tipo_contrato e cobra_prestacion", () => {
    const p = P.quitaRespuestasOcultas(pensionista, { otroPais: false, sinElegir: false });
    assert.equal(P.leer(p, "vinculos.entidad_trabajo.tipo"), undefined);
    assert.equal(P.leer(p, "vinculos.entidad_trabajo.ambito"), undefined);
    assert.equal(P.leer(p, "empleo.tipo_contrato"), undefined);
    assert.equal(P.leer(p, "empleo.cobra_prestacion"), undefined);
  });
  test("le risposte delle schermate che si mostrano restano (il meses_cotizados vale per tutti)", () => {
    const p = P.quitaRespuestasOcultas(pensionista, { otroPais: false, sinElegir: false });
    assert.equal(P.leer(p, "empleo.meses_cotizados_6_anios"), 40);
    assert.equal(P.leer(p, "persona.anio_nacimiento"), 1958);
    assert.equal(P.leer(p, "residencia.region"), "ES-VC");
    assert.equal(P.leer(p, "residencia.municipio_ine"), "46250");
  });
  test("chi lavora da asalariado conserva il suo ente e il suo contratto", () => {
    const asalariado = { ...pensionista, empleo: { situaciones: ["asalariado"], tipo_contrato: "indefinido", cobra_prestacion: undefined } };
    const p = P.quitaRespuestasOcultas(asalariado, { otroPais: false, sinElegir: false });
    assert.equal(P.leer(p, "vinculos.entidad_trabajo.tipo"), "empresa");
    assert.equal(P.leer(p, "empleo.tipo_contrato"), "indefinido");
  });
  test("il paese non si tocca e la residenza fuori Spagna toglie comune e comunità", () => {
    const fuera = { residencia: { pais: "FR", region: "ES-VC", municipio: "València" } };
    const p = P.quitaRespuestasOcultas(fuera, { otroPais: true, sinElegir: false });
    assert.equal(P.leer(p, "residencia.pais"), "FR");
    assert.equal(P.leer(p, "residencia.region"), undefined);
    assert.equal(P.leer(p, "residencia.municipio"), undefined);
  });
  test("la scelta «nacional» non cancella il permiso di lavoro scritto dal documento", () => {
    const nacional = { situacion_administrativa: { tipo: "nacional", autoriza_trabajar: true } };
    const p = P.quitaRespuestasOcultas(nacional, { otroPais: false, sinElegir: false });
    assert.equal(P.leer(p, "situacion_administrativa.autoriza_trabajar"), true);
  });
});

describe("punto 9: situazioni incompatibili e «No trabajo»", () => {
  test("«Estoy jubilado» e «No trabajo ni busco trabajo» tolgono le altre situazioni di lavoro", () => {
    assert.deepEqual(P.quitaIncompatibles(["asalariado", "jubilado"], "jubilado"), ["jubilado"]);
    assert.deepEqual(P.quitaIncompatibles(["autonomo", "inactivo"], "inactivo"), ["inactivo"]);
    assert.deepEqual(P.quitaIncompatibles(["desempleado", "inactivo"], "inactivo"), ["inactivo"]);
  });
  test("viceversa: scegliere un lavoro toglie «jubilado» e «no trabajo»", () => {
    assert.deepEqual(P.quitaIncompatibles(["jubilado", "asalariado"], "asalariado"), ["asalariado"]);
    assert.deepEqual(P.quitaIncompatibles(["inactivo", "autonomo"], "autonomo"), ["autonomo"]);
  });
  test("le altre combinazioni restano: studiare con la pensione, per esempio", () => {
    assert.deepEqual(P.quitaIncompatibles(["estudiante", "jubilado"], "jubilado").sort(), ["estudiante", "jubilado"]);
    assert.deepEqual(P.quitaIncompatibles(["jubilado", "inactivo"], "inactivo").sort(), ["inactivo", "jubilado"]);
  });
  test("«No trabajo» non si può scegliere se si è detto di lavorare", () => {
    const con = (s) => ({ empleo: { situaciones: s } });
    assert.equal(P.opcionDisponible("vinculos.entidad_trabajo.tipo", "ninguna", con(["asalariado"])), false);
    assert.equal(P.opcionDisponible("vinculos.entidad_trabajo.tipo", "ninguna", con(["autonomo", "estudiante"])), false);
    assert.equal(P.opcionDisponible("vinculos.entidad_trabajo.tipo", "ninguna", con(["jubilado"])), true);
    assert.equal(P.opcionDisponible("vinculos.entidad_trabajo.tipo", "ninguna", {}), true);
    assert.equal(P.opcionDisponible("vinculos.entidad_trabajo.tipo", "empresa", con(["asalariado"])), true);
  });
});

describe("punto 10: residenza dopo «Quitar respuesta»", () => {
  const sinPais = { residencia: { pais: "no_lo_se" } };
  test("con il paese salvato come «No lo sé» e nessuna scelta nel radio, la CV non è richiesta", () => {
    assert.equal(P.residenciaEnEspana(sinPais, { otroPais: false, sinElegir: true }), false);
    for (const campo of ["residencia.region", "residencia.provincia", "residencia.municipio", "residencia.empadronado_desde"]) {
      assert.equal(control("residencia", campo).si(sinPais, { otroPais: false, sinElegir: true }), false, campo);
    }
  });
  test("«No lo sé» scelto nel radio continua a chiedere la CV", () => {
    assert.equal(P.residenciaEnEspana(sinPais, { otroPais: false, sinElegir: false }), true);
    assert.equal(control("residencia", "residencia.region").si(sinPais, { otroPais: false, sinElegir: false }), true);
  });
  test("«España» senza scelta nel radio: la CV si chiede di nuovo solo con una scelta", () => {
    assert.equal(P.residenciaEnEspana({ residencia: { pais: "ES" } }, { otroPais: false, sinElegir: false }), true);
  });
});
