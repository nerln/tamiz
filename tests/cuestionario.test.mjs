// Prove del questionario (web/js/preguntas.js) e della normalizzazione dei campi vecchi (web/js/motor.js).
// Dalla radice della copia: node --test
//
// Titoli di studio su più paesi (estudios.titulos_paises): una regola sul paese del titolo è soddisfatta se lo è per
// almeno un titolo. Titolarità del contratto (vivienda.contrato_titularidad): la cotitolarità conta come titolarità.
// Il profilo di partenza è inventato (schema/esempi/perfil-rodrigo.json).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluar, normalizaPerfil } from "../web/js/motor.js";
import { PANTALLAS, controlesVisibles, camposUsados, hayHijosMenores } from "../web/js/preguntas.js";

const RAIZ = new URL("../", import.meta.url);
const leer = (rel) => JSON.parse(readFileSync(new URL(rel, RAIZ), "utf8"));
const clona = (x) => JSON.parse(JSON.stringify(x));
const HOY = "2026-10-14";
const RODRIGO = leer("schema/esempi/perfil-rodrigo.json");
const GRUPOS = {
  UE: ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
    "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"],
  EEE_no_UE: ["IS", "LI", "NO"],
  Suiza: ["CH"],
};
const catalogoCon = (fichas) => ({
  esquema: "tamiz-catalogo", version: 1.1, actualizado_el: HOY, redactado_con_ia: true,
  revision_humana: { completa: false, por: null, el: null }, fichas, ayuda_humana: [], grupos_paises: GRUPOS,
});
const GRISOLIA = leer("catalogo/fichas/es-vc-grisolia-2027.json");
const DEDUCCION = leer("catalogo/fichas/es-vc-deduccion-irpf-alquiler-cambio-municipio-trabajo.json");
const IDX_TITULO = GRISOLIA.requisitos.findIndex((r) => r.campo === "estudios.titulo_pais");
const IDX_CONTRATO = DEDUCCION.requisitos.findIndex((r) => r.campo === "vivienda.contrato_a_su_nombre");

// Esito della riga di una scheda: il resultado della regola i (stesso ordine dei requisitos della scheda).
function esitoRiga(perfil, ficha, i) {
  const res = evaluar(catalogoCon([ficha]), perfil, HOY);
  const v = res.fichas.find((f) => f.id === ficha.id);
  assert.ok(v, `la scheda ${ficha.id} non ha esito`);
  return v.requisitos[i].resultado;
}
const conTitulos = (lista) => {
  const p = clona(RODRIGO);
  p.estudios = { ...p.estudios, titulo_extranjero: true, titulos_paises: lista };
  delete p.estudios.titulo_pais;
  return p;
};
const conContrato = (valor) => {
  const p = clona(RODRIGO);
  p.vivienda = { ...p.vivienda, regimen: "alquiler", alquiler_mensual: 600, contrato_titularidad: valor };
  delete p.vivienda.contrato_a_su_nombre;
  return p;
};

describe("normalizaPerfil: campi vecchi convertiti, oggetto ricevuto intatto", () => {
  test("titulo_pais diventa titulos_paises, contrato_a_su_nombre diventa contrato_titularidad", () => {
    const viejo = { estudios: { titulo_extranjero: true, titulo_pais: "PY" }, vivienda: { contrato_a_su_nombre: false } };
    const copia = clona(viejo);
    const n = normalizaPerfil(viejo);
    assert.deepEqual(n.estudios.titulos_paises, ["PY"]);
    assert.equal(n.estudios.titulo_pais, undefined);
    assert.equal(n.vivienda.contrato_titularidad, "otra_persona");
    assert.equal(n.vivienda.contrato_a_su_nombre, undefined);
    assert.deepEqual(viejo, copia, "l'oggetto ricevuto non deve cambiare");
  });
  test("il campo nuovo, se c'è già, vince su quello vecchio", () => {
    const n = normalizaPerfil({ estudios: { titulo_pais: "PY", titulos_paises: ["IT", "AT"] },
      vivienda: { contrato_a_su_nombre: true, contrato_titularidad: "compartido" } });
    assert.deepEqual(n.estudios.titulos_paises, ["IT", "AT"]);
    assert.equal(n.vivienda.contrato_titularidad, "compartido");
  });
  test("true diventa solo_mio, no_lo_se resta no_lo_se", () => {
    assert.equal(normalizaPerfil({ vivienda: { contrato_a_su_nombre: true } }).vivienda.contrato_titularidad, "solo_mio");
    assert.equal(normalizaPerfil({ vivienda: { contrato_a_su_nombre: "no_lo_se" } }).vivienda.contrato_titularidad, "no_lo_se");
  });
});

describe("titoli di studio su più paesi: una regola è soddisfatta se lo è per almeno un titolo", () => {
  test("Italia e Austria: la regola «non UE» non è soddisfatta (entrambi UE)", () => {
    assert.equal(esitoRiga(conTitulos(["IT", "AT"]), GRISOLIA, IDX_TITULO), "no_cumple");
  });
  test("Italia e Brasile: basta un titolo non UE, la regola è soddisfatta", () => {
    assert.equal(esitoRiga(conTitulos(["IT", "BR"]), GRISOLIA, IDX_TITULO), "cumple");
  });
  test("titolo vecchio (un solo paese, Brasile) letto e convertito", () => {
    const p = clona(RODRIGO);
    p.estudios = { ...p.estudios, titulo_extranjero: true, titulo_pais: "BR" };
    delete p.estudios.titulos_paises;
    assert.equal(esitoRiga(p, GRISOLIA, IDX_TITULO), "cumple");
  });
  test("paesi «no lo sé» danno falta_dato, non cumple", () => {
    assert.equal(esitoRiga(conTitulos("no_lo_se"), GRISOLIA, IDX_TITULO), "falta_dato");
  });
  test("il profilo con titoli di Italia e Austria è valido per lo schema: i paesi sono codici ISO", () => {
    const p = conTitulos(["IT", "AT"]);
    assert.deepEqual(p.estudios.titulos_paises, ["IT", "AT"]);
    assert.ok(evaluar(catalogoCon([GRISOLIA]), p, HOY).fichas.length === 1);
  });
});

describe("titolarità del contratto: la cotitolarità conta come titolarità", () => {
  test("contratto compartido: la deduzione per affitto non dà no_cumple", () => {
    assert.notEqual(esitoRiga(conContrato("compartido"), DEDUCCION, IDX_CONTRATO), "no_cumple");
    assert.equal(esitoRiga(conContrato("compartido"), DEDUCCION, IDX_CONTRATO), "cumple");
  });
  test("solo a mio nome: cumple", () => {
    assert.equal(esitoRiga(conContrato("solo_mio"), DEDUCCION, IDX_CONTRATO), "cumple");
  });
  test("a nome di un'altra persona: non è una prova di titolarità, la regola non è decisa", () => {
    assert.equal(esitoRiga(conContrato("otra_persona"), DEDUCCION, IDX_CONTRATO), "falta_dato");
  });
  test("no lo sé: falta_dato", () => {
    assert.equal(esitoRiga(conContrato("no_lo_se"), DEDUCCION, IDX_CONTRATO), "falta_dato");
  });
});

describe("ordine e visibilità delle domande", () => {
  const indice = (id) => PANTALLAS.findIndex((p) => p.id === id);
  test("la domanda sui figli viene prima di quella sulla convivenza", () => {
    assert.ok(indice("hijos") >= 0 && indice("hijos") < indice("hogar"));
  });
  test("«único adulto a cargo» non si mostra senza figli minori", () => {
    const hogar = PANTALLAS.find((p) => p.id === "hogar");
    const usados = new Set(["hogar.monoparental"]);
    const sinHijos = { hogar: { miembros: 2, hijos: [] } };
    const campos = (perfil) => controlesVisibles(hogar, perfil, usados).map((c) => c.campo);
    assert.ok(!campos(sinHijos).includes("hogar.monoparental"));
    assert.ok(!campos({ hogar: { miembros: 1, hijos: [{ anio_nacimiento: 2000 }] } }).includes("hogar.monoparental"));
    assert.ok(campos({ hogar: { miembros: 2, hijos: [{ anio_nacimiento: 2020 }] } }).includes("hogar.monoparental"));
  });
  test("hayHijosMenores: minore, età non nota o figli non noti sì; solo adulti no", () => {
    assert.equal(hayHijosMenores({}), false);
    assert.equal(hayHijosMenores({ hogar: { hijos: [{ anio_nacimiento: 2000 }] } }), false);
    assert.equal(hayHijosMenores({ hogar: { hijos: [{ anio_nacimiento: 2020 }] } }), true);
    assert.equal(hayHijosMenores({ hogar: { hijos: [{ anio_nacimiento: "no_lo_se" }] } }), true);
    assert.equal(hayHijosMenores({ hogar: { hijos: "no_lo_se" } }), true);
  });
  test("data di nascita: un solo gruppo con mese e anno, nessun campo vecchio", () => {
    const nacim = PANTALLAS.find((p) => p.id === "anio").controles;
    assert.equal(nacim.length, 1);
    assert.equal(nacim[0].tipo, "mesanio");
    assert.equal(nacim[0].campo, "persona.anio_nacimiento");
    assert.equal(nacim[0].campo_mes, "persona.mes_nacimiento");
  });
  test("titoli: un controllo di più paesi (estudios.titulos_paises), nessun controllo di un paese solo", () => {
    const titulo = PANTALLAS.find((p) => p.id === "titulo").controles;
    const campi = titulo.map((c) => c.campo);
    assert.ok(!campi.includes("estudios.titulo_pais"));
    assert.equal(titulo.find((c) => c.campo === "estudios.titulos_paises").tipo, "paises");
  });
  test("le schede che leggono il vecchio campo titolo o contratto usano anche quello nuovo", () => {
    const usados = camposUsados(catalogoCon([GRISOLIA, DEDUCCION]));
    assert.ok(usados.has("estudios.titulo_pais") && usados.has("estudios.titulos_paises"));
    assert.ok(usados.has("vivienda.contrato_a_su_nombre") && usados.has("vivienda.contrato_titularidad"));
  });
});
