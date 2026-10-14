// Prove delle correzioni L38-2 al questionario: i quattro gravi (residenza, documento che autorizza il lavoro, permiso
// di guida «ninguno», «No trabajo» / «No estudio») e alcuni minori. Dalla radice della copia: node --test tests/*.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as P from "../web/js/preguntas.js";
import { FABRICA, opcionesPaisMenu } from "../web/js/ui/cuestionario.js";
import { evaluar } from "../web/js/motor.js";

const RAIZ = new URL("../", import.meta.url);
const leer = (rel) => JSON.parse(readFileSync(new URL(rel, RAIZ), "utf8"));
const HOY = "2026-10-15";
const control = (pantalla, campo) => P.PANTALLAS.find((p) => p.id === pantalla).controles.find((c) => c.campo === campo);
const catalogoCon = (fichas) => ({
  esquema: "tamiz-catalogo", version: 1.1, actualizado_el: HOY, redactado_con_ia: true,
  revision_humana: { completa: false, por: null, el: null }, fichas, ayuda_humana: [], grupos_paises: {},
});
const esitoRiga = (perfil, ficha, i) => {
  const v = evaluar(catalogoCon([ficha]), perfil, HOY).fichas.find((f) => f.id === ficha.id);
  assert.ok(v, `la scheda ${ficha.id} non ha esito`);
  return v.requisitos[i].resultado;
};
const CANJE = leer("catalogo/fichas/es-canje-permiso-conducir-paises-con-convenio.json");
const RESIDENCIA_TEMPORAL = { persona: { anio_nacimiento: 1990 }, situacion_administrativa: { tipo: "residencia_temporal" } };

describe("grave 1: «En otro país» con «No lo sé» nel menu: schermata coerente", () => {
  const pais = (valore) => ({ residencia: { pais: valore } });
  test("il menu del paese si apre solo con il radio «En otro país», non per il valore nel profilo", () => {
    assert.equal(P.esOtroPais(pais("FR"), { otroPais: false }), false);
    assert.equal(P.esOtroPais(pais("FR"), undefined), false);
    assert.equal(P.esOtroPais({}, { otroPais: true }), true);
  });
  test("con paese «no lo sé» e radio «En otro país» le domande della CV non sono richieste", () => {
    const region = control("residencia", "residencia.region");
    const provincia = control("residencia", "residencia.provincia");
    const municipio = control("residencia", "residencia.municipio");
    const empadronado = control("residencia", "residencia.empadronado_desde");
    for (const c of [region, provincia, municipio, empadronado]) {
      assert.equal(c.si(pais("no_lo_se"), { otroPais: true }), false, c.etiqueta);
    }
  });
  test("con «No lo sé» dal radio la CV resta visibile (come prima)", () => {
    const region = control("residencia", "residencia.region");
    assert.equal(region.si(pais("no_lo_se"), { otroPais: false }), true);
    assert.equal(region.si(pais("ES"), { otroPais: false }), true);
    assert.equal(region.si(pais("FR"), { otroPais: true }), false);
  });
  test("«Otro país» (XX) è nella lista dei paesi e nel menu del paese", () => {
    assert.ok(P.PAISES.some(([k, t]) => k === "XX" && t === "Otro país"));
    assert.ok(opcionesPaisMenu().some(([k]) => k === "XX"));
  });
  test("il radio «En otro país» non risponde più con un elenco vuoto che lascia il paese vecchio", () => {
    assert.doesNotMatch(FABRICA.radio.toString(), /escrituras: \[\] \}/);
    assert.match(FABRICA.radio.toString(), /radio_pais_otro && codigo === "otro"/);
  });
  test("«Quitar respuesta» sul paese svuota il menu del paese", () => {
    assert.match(FABRICA.pais.toString(), /vacia/);
  });
});

describe("grave 2: il valore automatico di «¿Tu documento te permite trabajar?» non sopravvive al cambio di documento", () => {
  test("con un documento che lo dà per legge la domanda parte vuota", () => {
    assert.equal(P.previoAutorizaTrabajar({ situacion_administrativa: { tipo: "nacional", autoriza_trabajar: true } }), undefined);
  });
  test("con un documento che richiede la domanda, la risposta della persona resta", () => {
    assert.equal(P.previoAutorizaTrabajar({ situacion_administrativa: { tipo: "residencia_temporal", autoriza_trabajar: false } }), false);
    assert.equal(P.previoAutorizaTrabajar({ situacion_administrativa: { tipo: "residencia_temporal" } }), undefined);
  });
});

describe("grave 3: «No tengo permiso de conducir» (vinculos.permiso_conducir_pais = ninguno)", () => {
  test("lo schema del profilo accetta ninguno", () => {
    const schema = leer("schema/perfil.schema.json");
    const consts = schema.properties.vinculos.properties.permiso_conducir_pais.anyOf.map((x) => x.const);
    assert.ok(consts.includes("ninguno"));
  });
  test("la pagina del permiso offre «No tengo permiso de conducir»", () => {
    const c = control("permiso", "vinculos.permiso_conducir_pais");
    assert.deepEqual(c.nadie, ["ninguno", "No tengo permiso de conducir"]);
    assert.ok(opcionesPaisMenu(c.nadie).some(([k, t]) => k === "ninguno" && t === "No tengo permiso de conducir"));
  });
  test("la scheda del canje dà «no cumple» (No encaja) con ninguno, «falta» con no lo sé", () => {
    const perfil = { ...RESIDENCIA_TEMPORAL, vinculos: { permiso_conducir_pais: "ninguno" } };
    assert.equal(esitoRiga(perfil, CANJE, 0), "no_cumple");
    const sinDato = { ...RESIDENCIA_TEMPORAL, vinculos: { permiso_conducir_pais: "no_lo_se" } };
    assert.equal(esitoRiga(sinDato, CANJE, 0), "falta_dato");
  });
});

describe("grave 4: «No trabajo» e «No estudio» (tipo ninguna), e ciascuna domanda solo se ha senso", () => {
  const ficha = {
    id: "prueba-ente", nombre: "Prueba ente", ambito: "ES",
    requisitos: [{ campo: "vinculos.entidad_trabajo.tipo", op: "==", valor: "hospital_o_instituto_sanitario",
      texto: "Trabajar en un hospital", no_concluyente: ["no_cumple"] }],
  };
  test("«ninguna» dà «no cumple» per un requisito sull'ente, mai «falta» né «encaja»", () => {
    assert.equal(esitoRiga({ vinculos: { entidad_trabajo: { tipo: "ninguna" } } }, ficha, 0), "no_cumple");
    assert.equal(esitoRiga({ vinculos: { entidad_trabajo: { tipo: "no_lo_se" } } }, ficha, 0), "falta_dato");
  });
  test("il radio dell'ente offre «No trabajo» e «No estudio»", () => {
    assert.ok(P.OPC_ENTIDAD_TRABAJO.some(([k, t]) => k === "ninguna" && t === "No trabajo"));
    assert.ok(P.OPC_ENTIDAD_ESTUDIOS.some(([k, t]) => k === "ninguna" && t === "No estudio"));
  });
  test("la domanda sul lavoro compare solo se lavora (o la situazione non è nota)", () => {
    assert.equal(P.puedeTrabajar({ empleo: { situaciones: ["estudiante"] } }), false);
    assert.equal(P.puedeTrabajar({ empleo: { situaciones: ["asalariado"] } }), true);
    assert.equal(P.puedeTrabajar({ empleo: { situaciones: ["estudiante", "autonomo"] } }), true);
    assert.equal(P.puedeTrabajar({ empleo: { situaciones: "no_lo_se" } }), true);
  });
  test("la domanda sul centro di studio compare solo se studia", () => {
    assert.equal(P.puedeEstudiar({ empleo: { situaciones: ["asalariado"] } }), false);
    assert.equal(P.puedeEstudiar({ empleo: { situaciones: ["estudiante"] } }), true);
  });
});

describe("minori", () => {
  test("il testo di sesso non dice «Puedes no contestar»", () => {
    const sesso = P.PANTALLAS.find((p) => p.id === "sexo");
    assert.doesNotMatch(sesso.porque, /Puedes no contestar/);
  });
  test("l'errore di sesso nomina «Prefiero no decirlo»", () => {
    assert.match(FABRICA.radio.toString(), /Prefiero no decirlo/);
  });
  test("il messaggio dei figli non ha i puntini", () => {
    assert.doesNotMatch(FABRICA.hijos.toString(), /No tengo hijos…/);
  });
  test("l'anno di nascita non può essere nel futuro", () => {
    assert.match(FABRICA.mesanio.toString(), /anioMaximo/);
  });
});
