// Prove del motore delle regole (web/js/motor.js) contro docs/ESQUEMA.md v1.1.
// Si lanciano dalla radice della copia con: node --test tests/*.test.mjs  (oppure solo: node --test).
// «node --test tests/» su Node 22 fallisce con «Cannot find module …/tests»: non usarlo.
//
// Tutti i profili sono inventati: Lucía e Rodrigo (schema/esempi/) e i profili di
// tests/perfiles/. Le schede di tests/fichas/ sono le tre d'esempio più schede di prova
// che non descrivono nessuna ayuda vera.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { evaluar } from "../web/js/motor.js";

const RAIZ = new URL("../", import.meta.url);
const leer = (rel) => JSON.parse(readFileSync(new URL(rel, RAIZ), "utf8"));
const clona = (x) => JSON.parse(JSON.stringify(x));

const HOY = "2026-10-14";
const LUCIA = leer("schema/esempi/perfil-lucia.json");
const RODRIGO = leer("schema/esempi/perfil-rodrigo.json");
const VACIO = { esquema: "tamiz-perfil", version: 1.1 };

const GRUPOS = {
  UE: ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
    "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"],
  EEE_no_UE: ["IS", "LI", "NO"],
  Suiza: ["CH"],
};

function catalogoCon(fichas) {
  return {
    esquema: "tamiz-catalogo", version: 1.1, actualizado_el: HOY, redactado_con_ia: true,
    revision_humana: { completa: false, por: null, el: null },
    fichas, ayuda_humana: [], grupos_paises: GRUPOS,
  };
}

const ID_EJEMPLO = ["es-aei-fpu-2026", "es-sepe-prestacion-contributiva-desempleo",
  "es-vc-bono-alquiler-joven-2026"];
const FICHAS_TEST = readdirSync(new URL("tests/fichas/", RAIZ))
  .filter((f) => f.endsWith(".json")).sort()
  .map((f) => leer(`tests/fichas/${f}`));
const ficha = (id) => FICHAS_TEST.find((f) => f.id === id);
const CAT_EJEMPLO = catalogoCon(ID_EJEMPLO.map(ficha));
const CAT_TEST = catalogoCon(FICHAS_TEST);
// Catalogo d'esempio costruito in memoria con la stessa forma di `construir.py --ejemplo`
// (schede, ayuda_humana, glosario, sitio, gruppi di base). NON legge web/data/catalogo.json:
// quello è un artefatto di build e cambia quando il catalogo vero viene costruito.
const CAT_ESEMPI = (() => {
  const dir = "schema/esempi/fichas/";
  const fichas = readdirSync(new URL(dir, RAIZ))
    .filter((f) => f.endsWith(".json")).sort()
    .map((f) => leer(dir + f))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return {
    esquema: "tamiz-catalogo", version: 1.1, actualizado_el: HOY, redactado_con_ia: true,
    revision_humana: { completa: false, por: null, el: null },
    sitio: leer("sitio.json"), fichas,
    ayuda_humana: leer("schema/esempi/ayuda_humana.json"), grupos_paises: GRUPOS,
    glosario: leer("schema/esempi/glosario.json"),
  };
})();

const PERFILES = Object.fromEntries(readdirSync(new URL("tests/perfiles/", RAIZ))
  .filter((f) => f.endsWith(".json")).sort()
  .map((f) => [f.replace(/\.json$/, ""), leer(`tests/perfiles/${f}`)]));

const voce = (res, id) => res.fichas.find((f) => f.id === id);
const fila = (res, id, i) => voce(res, id).requisitos[i];

// Copia del profilo con un campo cambiato (valor === undefined lo toglie).
function con(perfil, percorso, valor) {
  const p = clona(perfil);
  const pezzi = percorso.split(".");
  let cur = p;
  for (const k of pezzi.slice(0, -1)) {
    if (cur[k] === undefined || cur[k] === null || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k];
  }
  const ult = pezzi[pezzi.length - 1];
  if (valor === undefined) delete cur[ult];
  else cur[ult] = valor;
  return p;
}

// I 47 percorsi che possono comparire in faltan (Contrato de evaluar()).
const PERCORSI_AMMESSI = new Set([
  "persona.anio_nacimiento", "persona.mes_nacimiento", "persona.sexo", "persona.nacionalidades",
  "situacion_administrativa.tipo", "situacion_administrativa.residencia_legal_desde",
  "situacion_administrativa.documento_desde", "situacion_administrativa.documento_hasta",
  "situacion_administrativa.autoriza_trabajar",
  "residencia.pais", "residencia.region", "residencia.provincia", "residencia.municipio_ine",
  "residencia.empadronado_desde",
  "hogar.miembros", "hogar.hijos", "hogar.monoparental", "hogar.pareja", "hogar.familia_numerosa",
  "vivienda.regimen", "vivienda.alquiler_mensual", "vivienda.contrato_a_su_nombre",
  "ingresos.individual.tramo", "ingresos.individual.importe", "ingresos.hogar.tramo",
  "ingresos.hogar.importe", "ingresos.patrimonio_sin_vivienda.tramo",
  "ingresos.patrimonio_sin_vivienda.importe",
  "empleo.situaciones", "empleo.tipo_contrato", "empleo.contrato_hasta",
  "empleo.meses_cotizados_6_anios", "empleo.inscrito_demandante", "empleo.cobra_prestacion",
  "estudios.nivel_max", "estudios.matriculado_en", "estudios.titulo_extranjero",
  "estudios.titulo_pais", "estudios.homologacion",
  "vinculos.entidad_trabajo.tipo", "vinculos.entidad_trabajo.ambito",
  "vinculos.entidad_estudios.tipo", "vinculos.entidad_estudios.ambito",
  "vinculos.permiso_conducir_pais", "vinculos.paises_origen", "vinculos.paises_cotizacion",
  "vinculos.afiliaciones",
]);
const MOTIVI = new Set([null, "falta", "rango", "depende_del_dia", "no_concluyente",
  "dato_no_valido", "regla_no_valida"]);
const ESTADI = new Set(["encaja", "falta_dato", "no_encaja"]);
const ESITO_DI = { encaja: "cumple", falta_dato: "falta_dato", no_encaja: "no_cumple" };

// Controlli di forma che valgono per qualunque uscita del motore.
function controllaForma(res) {
  for (const v of res.fichas) {
    assert.deepEqual(Object.keys(v), ["id", "tipo", "estado", "apertura", "por_revisar",
      "proximo_plazo", "razones", "faltan", "requisitos"]);
    assert.ok(ESTADI.has(v.estado), v.estado);
    if (v.estado !== "falta_dato") assert.deepEqual(v.faltan, [], `${v.id}: faltan con ${v.estado}`);
    for (const p of v.faltan) assert.ok(PERCORSI_AMMESSI.has(p), `percorso non ammesso: ${p}`);
    assert.equal(new Set(v.faltan).size, v.faltan.length, "faltan ripetuti");
    // estado = minimo delle righe
    const ordine = { no_cumple: 0, falta_dato: 1, cumple: 2 };
    const minimo = v.requisitos.reduce((m, r) => (ordine[r.resultado] < ordine[m] ? r.resultado : m), "cumple");
    assert.equal(ESITO_DI[v.estado], minimo);
    for (const r of v.requisitos) {
      assert.deepEqual(Object.keys(r), ["texto", "resultado", "motivo", "aclaracion", "faltan"]);
      assert.ok(MOTIVI.has(r.motivo));
      if (r.resultado !== "falta_dato") {
        assert.equal(r.motivo, null);
        assert.deepEqual(r.faltan, []);
      } else {
        assert.notEqual(r.motivo, null);
      }
      for (const p of r.faltan) assert.ok(PERCORSI_AMMESSI.has(p), `percorso non ammesso: ${p}`);
    }
  }
  assert.deepEqual(Object.keys(res.perfil_calculado), CALC);
}

const CALC = ["calc.edad", "calc.anios_residencia_legal", "calc.meses_residencia_legal",
  "calc.anios_empadronado", "calc.meses_empadronado", "calc.num_hijos", "calc.hijos_menores_3",
  "calc.hijos_menores_18", "calc.hijos_menores_25", "calc.ingresos_individuales",
  "calc.ingresos_hogar", "calc.ingresos_hogar_por_miembro", "calc.patrimonio_sin_vivienda"];

// ---------------------------------------------------------------------------

describe("i tre esempi del Contrato in ESQUEMA.md, riprodotti esattamente", () => {
  const doc = readFileSync(new URL("docs/ESQUEMA.md", RAIZ), "utf8");
  const sezione = doc.slice(doc.indexOf("### Tre esempi"), doc.indexOf("## 6. Interfaccia"));
  const blocchi = [...sezione.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));

  test("nel documento ci sono tre esempi", () => assert.equal(blocchi.length, 3));

  const casi = [
    ["Esempio 1 — Lucía oggi", LUCIA, "2026-10-14"],
    ["Esempio 2 — profilo vuoto", VACIO, "2026-10-14"],
    ["Esempio 3 — Rodrigo fra tre mesi", RODRIGO, "2027-01-15"],
  ];
  casi.forEach(([nome, perfil, hoy], i) => {
    test(`${nome} (catalogo delle schede di prova)`, () => {
      assert.deepStrictEqual(evaluar(CAT_EJEMPLO, perfil, hoy), blocchi[i]);
    });
    test(`${nome} (catalogo d'esempio da schema/esempi/)`, () => {
      assert.deepStrictEqual(evaluar(CAT_ESEMPI, perfil, hoy), blocchi[i]);
    });
  });
});

describe("campi calcolati: la tabella di §3.2 (hoy = 2026-10-14)", () => {
  const L = evaluar(CAT_EJEMPLO, LUCIA, HOY).perfil_calculado;
  const R = evaluar(CAT_EJEMPLO, RODRIGO, HOY).perfil_calculado;
  test("Lucía calc.edad [28, 28]", () => assert.deepEqual(L["calc.edad"], [28, 28]));
  test("Rodrigo calc.edad [34, 35]", () => assert.deepEqual(R["calc.edad"], [34, 35]));
  test("Rodrigo calc.anios_residencia_legal [5, 5]", () => assert.deepEqual(R["calc.anios_residencia_legal"], [5, 5]));
  test("Rodrigo calc.anios_empadronado [6, 7]", () => assert.deepEqual(R["calc.anios_empadronado"], [6, 7]));
  test("Rodrigo calc.meses_empadronado [81, 93]", () => assert.deepEqual(R["calc.meses_empadronado"], [81, 93]));
  test("Lucía calc.hijos_menores_3 [0, 0]", () => assert.deepEqual(L["calc.hijos_menores_3"], [0, 0]));
  test("Lucía calc.ingresos_hogar [18001, 21000] (dall'individuale)", () => assert.deepEqual(L["calc.ingresos_hogar"], [18001, 21000]));
  test("Rodrigo calc.ingresos_individuales manca", () => assert.equal(R["calc.ingresos_individuales"], null));
  test("Rodrigo calc.num_hijos manca", () => assert.equal(R["calc.num_hijos"], null));
  test("mas_de_70000 dà hi null", () => {
    const p = con(VACIO, "ingresos.individual", { tramo: "mas_de_70000" });
    assert.deepEqual(evaluar(CAT_EJEMPLO, p, HOY).perfil_calculado["calc.ingresos_individuales"], [70001, null]);
  });
  test("importe vale più del tramo", () => {
    const p = con(VACIO, "ingresos.individual", { tramo: "cero", importe: 12345 });
    assert.deepEqual(evaluar(CAT_EJEMPLO, p, HOY).perfil_calculado["calc.ingresos_individuales"], [12345, 12345]);
  });
  test("ingresos_hogar_por_miembro divide senza arrotondare", () => {
    const p = PERFILES["ingresos-tramo-umbral"];
    assert.deepEqual(evaluar(CAT_EJEMPLO, p, HOY).perfil_calculado["calc.ingresos_hogar_por_miembro"], [12500.5, 15000]);
  });
  test("con due membri ingresos_hogar NON viene dall'individuale", () => {
    const p = con(LUCIA, "hogar.miembros", 2);
    assert.equal(evaluar(CAT_EJEMPLO, p, HOY).perfil_calculado["calc.ingresos_hogar"], null);
  });
});

describe("regola d'oro: un dato che manca non dà mai encaja né no_encaja", () => {
  test("campo mancante → falta_dato con la domanda (paro senza mesi cotizzati)", () => {
    const p = con(con(LUCIA, "empleo.situaciones", ["desempleado"]), "empleo.meses_cotizados_6_anios", undefined);
    const v = voce(evaluar(CAT_EJEMPLO, p, HOY), "es-sepe-prestacion-contributiva-desempleo");
    assert.equal(v.estado, "falta_dato");
    assert.deepEqual(v.faltan, ["empleo.meses_cotizados_6_anios"]);
    assert.deepEqual(v.requisitos[1], {
      texto: "Haber cotizado por desempleo al menos 360 días en los últimos 6 años",
      resultado: "falta_dato", motivo: "falta", aclaracion: null,
      faltan: ["empleo.meses_cotizados_6_anios"],
    });
    assert.deepEqual(v.razones, ["Haber cotizado por desempleo al menos 360 días en los últimos 6 años"]);
  });

  test("stesso campo a no_lo_se → falta_dato, motivo falta", () => {
    const p = con(con(LUCIA, "empleo.situaciones", ["desempleado"]), "empleo.meses_cotizados_6_anios", "no_lo_se");
    const v = voce(evaluar(CAT_EJEMPLO, p, HOY), "es-sepe-prestacion-contributiva-desempleo");
    assert.equal(v.estado, "falta_dato");
    assert.equal(v.requisitos[1].motivo, "falta");
  });

  for (const hoy of ["2026-10-14", "2027-01-15", "2025-01-01"]) {
    test(`profilo tutto «no lo sé» → zero encaja, zero no_encaja, ogni riga falta_dato (${hoy})`, () => {
      const res = evaluar(CAT_TEST, PERFILES["todo-no-lo-se"], hoy);
      controllaForma(res);
      assert.equal(res.ocultas_por_territorio, 0);
      assert.equal(res.fichas.length, FICHAS_TEST.length);
      for (const v of res.fichas) {
        assert.equal(v.estado, "falta_dato", v.id);
        for (const r of v.requisitos) {
          assert.equal(r.resultado, "falta_dato", `${v.id}: ${r.texto}`);
          assert.equal(r.motivo, "falta", `${v.id}: ${r.texto}`);
          assert.ok(r.faltan.length > 0, `${v.id}: ${r.texto} senza domanda`);
        }
      }
      for (const k of CALC) assert.equal(res.perfil_calculado[k], null, k);
    });
  }

  test("profilo tutto «otro» → nessuna riga che legge un «otro» è cumple o no_cumple", () => {
    const res = evaluar(CAT_TEST, PERFILES["todo-otro"], HOY);
    controllaForma(res);
    for (const v of res.fichas) {
      assert.equal(v.estado, "falta_dato", v.id);
      for (const r of v.requisitos) {
        assert.equal(r.resultado, "falta_dato", `${v.id}: ${r.texto}`);
        // «otro» è un dato che manca (§2.3), non un dato non valido
        assert.equal(r.motivo, "falta", `${v.id}: ${r.texto}`);
      }
    }
  });

  test("profilo vuoto: anche != e not_in danno falta_dato (§5.2)", () => {
    const res = evaluar(CAT_TEST, VACIO, HOY);
    const v = voce(res, "es-prueba-negaciones");
    assert.equal(v.estado, "falta_dato");
    for (const r of v.requisitos) assert.equal(r.resultado, "falta_dato", r.texto);
    assert.deepEqual(v.faltan, ["hogar.pareja", "vivienda.regimen", "persona.nacionalidades",
      "vinculos.paises_cotizacion", "empleo.inscrito_demandante"]);
  });

  test("prefiero_no_decirlo in hogar.pareja → falta_dato", () => {
    const p = con(LUCIA, "hogar.pareja", "prefiero_no_decirlo");
    const r = fila(evaluar(CAT_TEST, p, HOY), "es-prueba-negaciones", 0);
    assert.equal(r.resultado, "falta_dato");
    assert.deepEqual(r.faltan, ["hogar.pareja"]);
  });
});

describe("apertura, proximo_plazo e por_revisar", () => {
  const fpu = (hoy) => voce(evaluar(CAT_EJEMPLO, LUCIA, hoy), "es-aei-fpu-2026");
  test("scheda cerrado → apertura cerrada anche se i requisiti passano", () => {
    const v = voce(evaluar(CAT_EJEMPLO, LUCIA, HOY), "es-vc-bono-alquiler-joven-2026");
    assert.equal(v.estado, "encaja");
    assert.equal(v.apertura, "cerrada");
    assert.equal(v.proximo_plazo, null);
  });
  test("fechas: il giorno prima di inicio → por_abrir", () => {
    assert.equal(fpu("2026-10-19").apertura, "por_abrir");
    assert.equal(fpu("2026-10-19").proximo_plazo, "2026-11-12");
  });
  test("fechas: inicio e fin sono inclusi", () => {
    assert.equal(fpu("2026-10-20").apertura, "abierta");
    assert.equal(fpu("2026-11-12").apertura, "abierta");
    assert.equal(fpu("2026-11-12").proximo_plazo, "2026-11-12");
  });
  test("fechas: il giorno dopo fin → cerrada e niente proximo_plazo", () => {
    assert.equal(fpu("2026-11-13").apertura, "cerrada");
    assert.equal(fpu("2026-11-13").proximo_plazo, null);
  });
  test("abierto_todo_el_ano → abierta; convocatoria_anual e desconocido → desconocida", () => {
    const base = ficha("es-sepe-prestacion-contributiva-desempleo");
    const conPlazo = (plazo) => catalogoCon([{ ...clona(base), plazo }]);
    assert.equal(evaluar(conPlazo(base.plazo), LUCIA, HOY).fichas[0].apertura, "abierta");
    assert.equal(evaluar(conPlazo({ tipo: "convocatoria_anual", verificado: false }), LUCIA, HOY).fichas[0].apertura, "desconocida");
    assert.equal(evaluar(conPlazo({ tipo: "desconocido", verificado: false }), LUCIA, HOY).fichas[0].apertura, "desconocida");
    assert.equal(evaluar(conPlazo({ tipo: "fechas", fin: "2026-12-01", verificado: false }), LUCIA, HOY).fichas[0].apertura, "abierta");
  });
  test("revisar_antes_de passata → por_revisar (estremo: il giorno stesso no)", () => {
    assert.equal(fpu("2026-11-13").por_revisar, false);
    assert.equal(fpu("2026-11-14").por_revisar, true);
    const paro = (hoy) => voce(evaluar(CAT_EJEMPLO, LUCIA, hoy), "es-sepe-prestacion-contributiva-desempleo").por_revisar;
    assert.equal(paro("2027-01-12"), false);
    assert.equal(paro("2027-01-13"), true);
  });
  test("por_revisar non cambia l'esito", () => {
    const prima = voce(evaluar(CAT_EJEMPLO, LUCIA, "2026-12-01"), "es-vc-bono-alquiler-joven-2026");
    const dopo = voce(evaluar(CAT_EJEMPLO, LUCIA, "2027-02-01"), "es-vc-bono-alquiler-joven-2026");
    assert.equal(prima.estado, "encaja");
    assert.equal(dopo.estado, "encaja");
    assert.equal(dopo.por_revisar, true);
  });
});

describe("Lucía e Rodrigo contro le tre schede d'esempio (esiti scritti a mano)", () => {
  test("Rodrigo oggi (2026-10-14)", () => {
    const res = evaluar(CAT_EJEMPLO, RODRIGO, HOY);
    controllaForma(res);
    const sintesi = res.fichas.map((v) => [v.id, v.estado, v.apertura, v.por_revisar, v.proximo_plazo, v.faltan]);
    assert.deepEqual(sintesi, [
      ["es-sepe-prestacion-contributiva-desempleo", "no_encaja", "abierta", false, null, []],
      ["es-aei-fpu-2026", "no_encaja", "por_abrir", false, "2026-11-12", []],
      ["es-vc-bono-alquiler-joven-2026", "encaja", "cerrada", false, null, []],
    ]);
    // Bono: [34, 35] <= 35 è cumple anche senza il mese.
    assert.equal(fila(res, "es-vc-bono-alquiler-joven-2026", 0).resultado, "cumple");
    // FPU: bachillerato no; tipo_contrato no_lo_se → riga falta_dato con la domanda.
    assert.deepEqual(fila(res, "es-aei-fpu-2026", 1), {
      texto: "No tener ahora un contrato predoctoral (si lo tienes, cuentan los meses que llevas)",
      resultado: "falta_dato", motivo: "falta", aclaracion: null, faltan: ["empleo.tipo_contrato"],
    });
    assert.deepEqual(voce(res, "es-aei-fpu-2026").razones, ["Tener un grado o un máster y no tener el doctorado"]);
  });

  test("Lucía fra tre mesi (2027-01-15)", () => {
    const res = evaluar(CAT_EJEMPLO, LUCIA, "2027-01-15");
    controllaForma(res);
    const sintesi = res.fichas.map((v) => [v.id, v.estado, v.apertura, v.por_revisar, v.faltan]);
    assert.deepEqual(sintesi, [
      ["es-sepe-prestacion-contributiva-desempleo", "no_encaja", "abierta", true, []],
      ["es-vc-bono-alquiler-joven-2026", "encaja", "cerrada", true, []],
      ["es-aei-fpu-2026", "falta_dato", "cerrada", true, []],
    ]);
    assert.equal(fila(res, "es-aei-fpu-2026", 1).motivo, "no_concluyente");
    assert.deepEqual(res.perfil_calculado["calc.edad"], [28, 28]);
    assert.deepEqual(res.perfil_calculado["calc.meses_residencia_legal"], [39, 40]);
  });

  test("Rodrigo con il mese di nascita (maggio) il 2027-01-15: 35 anni → il Bono encaja", () => {
    const p = con(RODRIGO, "persona.mes_nacimiento", 5);
    const res = evaluar(CAT_EJEMPLO, p, "2027-01-15");
    assert.deepEqual(res.perfil_calculado["calc.edad"], [35, 35]);
    assert.equal(voce(res, "es-vc-bono-alquiler-joven-2026").estado, "encaja");
  });

  test("Rodrigo nato a gennaio, oggi 2027-01-15: depende_del_dia, nessuna domanda", () => {
    const p = con(RODRIGO, "persona.mes_nacimiento", 1);
    const res = evaluar(CAT_EJEMPLO, p, "2027-01-15");
    assert.deepEqual(res.perfil_calculado["calc.edad"], [35, 36]);
    const v = voce(res, "es-vc-bono-alquiler-joven-2026");
    assert.equal(v.estado, "falta_dato");
    assert.deepEqual(v.faltan, []);
    assert.equal(v.requisitos[0].motivo, "depende_del_dia");
  });
});

describe("profili avversari (tests/perfiles/)", () => {
  const P = PERFILES;
  test("età al limite: nato a ottobre 1991, «menos de 35» il giorno 14/10/2026 dipende dal giorno", () => {
    const res = evaluar(CAT_TEST, P["edad-35-mes-del-cumpleanos"], HOY);
    assert.deepEqual(res.perfil_calculado["calc.edad"], [34, 35]);
    const v = voce(res, "es-prueba-edad-menos-de-35");
    assert.equal(v.estado, "falta_dato");
    assert.deepEqual(v.requisitos[0], { texto: "Tener menos de 35 años", resultado: "falta_dato",
      motivo: "depende_del_dia", aclaracion: null, faltan: [] });
    // «35 o menos» invece è sicuro: [34, 35] <= 35.
    assert.equal(fila(res, "es-vc-bono-alquiler-joven-2026", 0).resultado, "cumple");
  });
  test("età al limite: 35 già compiuti (1/11/2026) → no_encaja; non ancora (30/09/2026) → encaja", () => {
    const dopo = evaluar(CAT_TEST, P["edad-35-mes-del-cumpleanos"], "2026-11-01");
    assert.deepEqual(dopo.perfil_calculado["calc.edad"], [35, 35]);
    assert.equal(voce(dopo, "es-prueba-edad-menos-de-35").estado, "no_encaja");
    const prima = evaluar(CAT_TEST, P["edad-35-mes-del-cumpleanos"], "2026-09-30");
    assert.deepEqual(prima.perfil_calculado["calc.edad"], [34, 34]);
    assert.equal(voce(prima, "es-prueba-edad-menos-de-35").estado, "encaja");
  });
  test("età senza mese a cavallo della soglia → domanda persona.mes_nacimiento", () => {
    const p = con(P["edad-35-mes-del-cumpleanos"], "persona.mes_nacimiento", undefined);
    const v = voce(evaluar(CAT_TEST, p, HOY), "es-prueba-edad-menos-de-35");
    assert.equal(v.estado, "falta_dato");
    assert.equal(v.requisitos[0].motivo, "rango");
    assert.deepEqual(v.faltan, ["persona.mes_nacimiento"]);
  });

  test("hijos: [] è una risposta (nessun figlio), «no lo sé» no", () => {
    const vuota = evaluar(CAT_TEST, P["hijos-lista-vacia"], HOY);
    assert.deepEqual(vuota.perfil_calculado["calc.num_hijos"], [0, 0]);
    assert.deepEqual(vuota.perfil_calculado["calc.hijos_menores_18"], [0, 0]);
    assert.equal(voce(vuota, "es-prueba-hijos").estado, "no_encaja");
    assert.equal(voce(vuota, "es-prueba-sin-hijos").estado, "encaja");

    const nls = evaluar(CAT_TEST, P["hijos-no-lo-se"], HOY);
    assert.equal(nls.perfil_calculado["calc.num_hijos"], null);
    for (const id of ["es-prueba-hijos", "es-prueba-sin-hijos"]) {
      const v = voce(nls, id);
      assert.equal(v.estado, "falta_dato", id);
      assert.deepEqual(v.faltan, ["hogar.hijos"], id);
    }
  });
  test("hijos: un figlio del 2008 senza mese e uno senza anno → intervalli", () => {
    const res = evaluar(CAT_TEST, P["hijos-edad-al-limite"], HOY);
    assert.deepEqual(res.perfil_calculado["calc.num_hijos"], [2, 2]);
    assert.deepEqual(res.perfil_calculado["calc.hijos_menores_3"], [0, 1]);
    assert.deepEqual(res.perfil_calculado["calc.hijos_menores_18"], [0, 2]);
    assert.deepEqual(res.perfil_calculado["calc.hijos_menores_25"], [1, 2]);
    const v = voce(res, "es-prueba-hijos");
    assert.equal(v.estado, "falta_dato");
    assert.deepEqual(v.requisitos.map((r) => [r.resultado, r.motivo]), [["cumple", null], ["falta_dato", "rango"]]);
    assert.deepEqual(v.faltan, ["hogar.hijos"]);
    assert.equal(voce(res, "es-prueba-sin-hijos").estado, "no_encaja");
  });

  test("residenza legale: 23 mesi → no_encaja, 24 → encaja, mese senza giorno → falta_dato", () => {
    const r23 = evaluar(CAT_TEST, P["residencia-23-meses"], HOY);
    const r24 = evaluar(CAT_TEST, P["residencia-24-meses"], HOY);
    const rm = evaluar(CAT_TEST, P["residencia-solo-mes"], HOY);
    assert.deepEqual(r23.perfil_calculado["calc.meses_residencia_legal"], [23, 23]);
    assert.deepEqual(r24.perfil_calculado["calc.meses_residencia_legal"], [24, 24]);
    assert.deepEqual(rm.perfil_calculado["calc.meses_residencia_legal"], [23, 24]);
    assert.equal(voce(r23, "es-prueba-residencia-24-meses").estado, "no_encaja");
    assert.equal(voce(r24, "es-prueba-residencia-24-meses").estado, "encaja");
    const v = voce(rm, "es-prueba-residencia-24-meses");
    assert.equal(v.estado, "falta_dato");
    assert.equal(v.requisitos[0].motivo, "rango");
    assert.deepEqual(v.faltan, ["situacion_administrativa.residencia_legal_desde"]);
  });
  test("residenza legale come data: <= 2024-10-14 con il solo mese → falta_dato", () => {
    const riga = (nome) => fila(evaluar(CAT_TEST, P[nome], HOY), "es-prueba-fechas", 0);
    assert.equal(riga("residencia-23-meses").resultado, "no_cumple");
    assert.equal(riga("residencia-24-meses").resultado, "cumple");
    assert.deepEqual(riga("residencia-solo-mes"), {
      texto: "Tener residencia legal desde el 14/10/2024 o antes", resultado: "falta_dato",
      motivo: "rango", aclaracion: null, faltan: ["situacion_administrativa.residencia_legal_desde"],
    });
  });

  test("reddito per tramo a cavallo della soglia → falta_dato e chiede l'importe", () => {
    const res = evaluar(CAT_TEST, P["ingresos-tramo-umbral"], HOY);
    const v = voce(res, "es-prueba-ingresos");
    assert.equal(v.estado, "falta_dato");
    assert.deepEqual(v.requisitos.map((r) => [r.resultado, r.motivo]), [["falta_dato", "rango"], ["cumple", null]]);
    assert.deepEqual(v.faltan, ["ingresos.individual.importe"]);
    // con no_concluyente ["no_cumple"] un intervallo largo resta «rango», con la domanda
    const b = voce(res, "es-prueba-base-imponible");
    assert.equal(b.requisitos[0].motivo, "rango");
    assert.deepEqual(b.faltan, ["ingresos.individual.importe"]);
  });
  test("reddito: importe 20000 → encaja, 20001 → no_encaja", () => {
    const base = P["ingresos-tramo-umbral"];
    const a = evaluar(CAT_TEST, con(base, "ingresos.individual.importe", 20000), HOY);
    const b = evaluar(CAT_TEST, con(base, "ingresos.individual.importe", 20001), HOY);
    assert.equal(voce(a, "es-prueba-ingresos").estado, "encaja");
    assert.equal(voce(b, "es-prueba-ingresos").estado, "no_encaja");
  });
  test("no_concluyente: un lordo sopra la soglia della base imponible non esclude", () => {
    const base = P["ingresos-tramo-umbral"];
    const sopra = voce(evaluar(CAT_TEST, con(base, "ingresos.individual.importe", 25000), HOY), "es-prueba-base-imponible");
    assert.equal(sopra.estado, "falta_dato");
    assert.deepEqual(sopra.faltan, []);
    assert.deepEqual(sopra.requisitos[0], {
      texto: "Tener una base imponible de 20.000 € o menos", resultado: "falta_dato",
      motivo: "no_concluyente",
      aclaracion: "Las bases miden la base imponible, que es menor que los ingresos brutos.",
      faltan: [],
    });
    const sotto = voce(evaluar(CAT_TEST, con(base, "ingresos.individual.importe", 19000), HOY), "es-prueba-base-imponible");
    assert.equal(sotto.estado, "encaja");
  });

  test("su tutti i profili avversari e su tre date: nessun encaja con un dato mancante sulle righe", () => {
    for (const [nome, perfil] of Object.entries(P)) {
      for (const hoy of ["2026-09-30", "2026-10-14", "2026-11-01", "2027-01-15"]) {
        const res = evaluar(CAT_TEST, perfil, hoy);
        controllaForma(res);
        for (const v of res.fichas) {
          if (v.estado !== "encaja") continue;
          for (const r of v.requisitos) assert.equal(r.resultado, "cumple", `${nome} ${hoy} ${v.id}`);
        }
      }
    }
  });
});

describe("operatori", () => {
  test("liste: completa, vuota, incompleta", () => {
    const neg = (p) => voce(evaluar(CAT_TEST, p, HOY), "es-prueba-negaciones");
    // Lucía: portoghese → contains_none UE è no_cumple; [] not_contains ES è cumple.
    const l = neg(LUCIA);
    assert.deepEqual(l.requisitos.map((r) => r.resultado), ["cumple", "cumple", "no_cumple", "cumple", "cumple"]);
    assert.equal(l.estado, "no_encaja");
    assert.deepEqual(l.razones, ["No tener la nacionalidad de un país de la UE"]);
    // lista incompleta senza intersezione → falta_dato
    const inc = neg(con(LUCIA, "persona.nacionalidades", ["AR", "no_lo_se"]));
    assert.equal(inc.requisitos[2].resultado, "falta_dato");
    assert.deepEqual(inc.requisitos[2].faltan, ["persona.nacionalidades"]);
    // lista incompleta con intersezione → decide
    const inc2 = neg(con(LUCIA, "persona.nacionalidades", ["IT", "no_lo_se"]));
    assert.equal(inc2.requisitos[2].resultado, "no_cumple");
    // lista intera no_lo_se → falta_dato
    assert.equal(neg(con(LUCIA, "vinculos.paises_cotizacion", "no_lo_se")).requisitos[3].resultado, "falta_dato");
    // lista completa senza intersezione → cumple
    assert.equal(neg(con(LUCIA, "persona.nacionalidades", ["AR"])).requisitos[2].resultado, "cumple");
  });
  test("contains con lista completa senza il valore → no_cumple; con «otro» → falta_dato", () => {
    const paro = (p) => fila(evaluar(CAT_EJEMPLO, p, HOY), "es-sepe-prestacion-contributiva-desempleo", 0);
    assert.equal(paro(LUCIA).resultado, "no_cumple");
    assert.equal(paro(con(LUCIA, "empleo.situaciones", ["asalariado", "otro"])).resultado, "falta_dato");
    assert.equal(paro(con(LUCIA, "empleo.situaciones", ["desempleado", "otro"])).resultado, "cumple");
    assert.equal(paro(con(LUCIA, "empleo.situaciones", [])).resultado, "no_cumple");
  });
  test("any_of / all_of: massimo e minimo, senza corto circuito", () => {
    const g = (p) => voce(evaluar(CAT_TEST, p, HOY), "es-vc-prueba-grupos");
    // Lucía: UE + 3 anni empadronada → all_of cumple → any_of cumple
    assert.equal(g(LUCIA).estado, "encaja");
    // senza empadronamiento: any_of = max(no_cumple, falta) = falta, con la domanda
    const senza = g(con(LUCIA, "residencia.empadronado_desde", undefined));
    assert.equal(senza.estado, "falta_dato");
    assert.deepEqual(senza.requisitos[0], {
      texto: "Ser español o española, o de la UE con 2 años de empadronamiento",
      resultado: "falta_dato", motivo: "falta", aclaracion: null,
      faltan: ["residencia.empadronado_desde"],
    });
    // Rodrigo: né nazionale né UE → no_cumple
    assert.equal(g(RODRIGO).requisitos[0].resultado, "no_cumple");
    assert.equal(g(RODRIGO).estado, "no_encaja");
    // un solo cumple nell'any_of basta, anche se l'altra alternativa manca
    const naz = g(con(VACIO, "situacion_administrativa.tipo", "nacional"));
    assert.equal(naz.requisitos[0].resultado, "cumple");
    // gruppo falta_dato: domande unite nell'ordine dei figli
    const vuoto = g(VACIO);
    assert.deepEqual(vuoto.requisitos[0].faltan, ["situacion_administrativa.tipo", "persona.nacionalidades",
      "residencia.empadronado_desde"]);
    assert.deepEqual(vuoto.faltan, ["situacion_administrativa.tipo", "persona.nacionalidades",
      "residencia.empadronado_desde", "residencia.provincia"]);
  });
  test("numeri: == e != con intervalli", () => {
    const regla = (op, valor) => catalogoCon([{ ...clona(ficha("es-prueba-sin-hijos")),
      requisitos: [{ campo: "calc.edad", op, valor, texto: "Regla de prueba" }] }]);
    const r = (op, valor, perfil) => evaluar(regla(op, valor), perfil, HOY).fichas[0].requisitos[0].resultado;
    assert.equal(r("==", 28, LUCIA), "cumple");
    assert.equal(r("!=", 28, LUCIA), "no_cumple");
    assert.equal(r("==", 34, RODRIGO), "falta_dato");
    assert.equal(r("!=", 34, RODRIGO), "falta_dato");
    assert.equal(r("==", 36, RODRIGO), "no_cumple");
    assert.equal(r("!=", 36, RODRIGO), "cumple");
    assert.equal(r(">", 34, RODRIGO), "falta_dato");
    assert.equal(r(">", 33, RODRIGO), "cumple");
    assert.equal(r(">=", 36, RODRIGO), "no_cumple");
  });
  test("booleani e date (contrato_hasta)", () => {
    const res = evaluar(CAT_TEST, LUCIA, HOY);
    // contrato_hasta 2027-09 >= 2027-01-01 → cumple
    assert.equal(fila(res, "es-prueba-fechas", 1).resultado, "cumple");
    const r = evaluar(CAT_TEST, con(LUCIA, "empleo.contrato_hasta", "2026"), HOY);
    assert.equal(fila(r, "es-prueba-fechas", 1).resultado, "no_cumple");
    // «2027» = [2027-01-01, 2027-12-31]: tutto dopo la soglia → cumple
    const r1 = evaluar(CAT_TEST, con(LUCIA, "empleo.contrato_hasta", "2027"), HOY);
    assert.equal(fila(r1, "es-prueba-fechas", 1).resultado, "cumple");
    // a cavallo della soglia → falta_dato, motivo rango, chiede la data
    const cat = catalogoCon([{ ...clona(ficha("es-prueba-fechas")), requisitos: [
      { campo: "empleo.contrato_hasta", op: ">=", valor: "2027-01-15", texto: "Tener contrato al menos hasta el 15/01/2027" }] }]);
    const r2 = evaluar(cat, con(LUCIA, "empleo.contrato_hasta", "2027-01"), HOY).fichas[0];
    assert.deepEqual(r2.requisitos[0], { texto: "Tener contrato al menos hasta el 15/01/2027",
      resultado: "falta_dato", motivo: "rango", aclaracion: null, faltan: ["empleo.contrato_hasta"] });
    const b = evaluar(CAT_TEST, con(LUCIA, "empleo.inscrito_demandante", true), HOY);
    assert.equal(fila(b, "es-prueba-negaciones", 4).resultado, "no_cumple");
  });
});

describe("dati non validi nel profilo (§5.6)", () => {
  const casi = [
    ["anno come testo", "persona.anio_nacimiento", "1998", "es-vc-bono-alquiler-joven-2026", 0, "persona.anio_nacimiento"],
    ["anno nel futuro", "persona.anio_nacimiento", 2030, "es-vc-bono-alquiler-joven-2026", 0, "persona.anio_nacimiento"],
    ["data impossibile", "situacion_administrativa.residencia_legal_desde", "2025-02-30", "es-prueba-residencia-24-meses", 0, "situacion_administrativa.residencia_legal_desde"],
    ["data *_desde nel futuro", "situacion_administrativa.residencia_legal_desde", "2030", "es-prueba-residencia-24-meses", 0, "situacion_administrativa.residencia_legal_desde"],
    ["tramo inesistente", "ingresos.individual", { tramo: "de_1_a_2" }, "es-prueba-ingresos", 0, "ingresos.individual.tramo"],
    // §5.5: per ingresos_hogar_por_miembro si chiede hogar.miembros e, se manca anche
    // calc.ingresos_hogar (qui non viene dall'individuale perché miembros non è 1), la sua domanda.
    ["miembros fuori intervallo", "hogar.miembros", 0, "es-prueba-ingresos", 1, ["hogar.miembros", "ingresos.hogar.tramo"]],
    ["enum sconosciuto", "situacion_administrativa.tipo", "sin_papeles", "es-vc-bono-alquiler-joven-2026", 1, "situacion_administrativa.tipo"],
    ["booleano come testo", "empleo.inscrito_demandante", "false", "es-prueba-negaciones", 4, "empleo.inscrito_demandante"],
    ["lista che non è lista", "persona.nacionalidades", "PT", "es-prueba-negaciones", 2, "persona.nacionalidades"],
    ["codice minuscolo", "residencia.provincia", "es-v", "es-vc-prueba-grupos", 1, "residencia.provincia"],
  ];
  for (const [nome, campo, valore, id, i, domanda] of casi) {
    test(`${nome} → falta_dato, dato_no_valido, chiede ${domanda}`, () => {
      const r = fila(evaluar(CAT_TEST, con(LUCIA, campo, valore), HOY), id, i);
      assert.equal(r.resultado, "falta_dato");
      assert.equal(r.motivo, "dato_no_valido");
      assert.deepEqual(r.faltan, Array.isArray(domanda) ? domanda : [domanda]);
    });
  }
  test("persona che non è un oggetto → manca, nessuna eccezione", () => {
    const p = { ...clona(LUCIA), persona: "x" };
    const r = fila(evaluar(CAT_EJEMPLO, p, HOY), "es-vc-bono-alquiler-joven-2026", 0);
    assert.equal(r.resultado, "falta_dato");
  });
});

describe("regole non valide nel catalogo (§5.6): falta_dato, mai no_cumple", () => {
  const base = ficha("es-prueba-sin-hijos");
  const cattive = [
    ["campo sconosciuto", { campo: "salud.discapacidad_pct", op: ">=", valor: 33, texto: "Regla rota" }],
    ["operatore non ammesso", { campo: "calc.edad", op: "contains", valor: 3, texto: "Regla rota" }],
    ["valor del tipo sbagliato", { campo: "calc.edad", op: "<=", valor: "35", texto: "Regla rota" }],
    ["== su una data", { campo: "empleo.contrato_hasta", op: "==", valor: "2027-01-01", texto: "Regla rota" }],
    ["data impossibile nel valor", { campo: "empleo.contrato_hasta", op: ">=", valor: "2027-02-30", texto: "Regla rota" }],
    ["gruppo di paesi inesistente", { campo: "persona.nacionalidades", op: "contains_any", valor_grupo: "Mercosur", texto: "Regla rota" }],
    ["valor_grupo su un campo che non lo ammette", { campo: "residencia.region", op: "in", valor_grupo: "UE", texto: "Regla rota" }],
    ["valor e valor_grupo insieme", { campo: "persona.nacionalidades", op: "contains_any", valor: ["PT"], valor_grupo: "UE", texto: "Regla rota" }],
    ["codice indeterminato come valor", { campo: "vivienda.regimen", op: "!=", valor: "no_lo_se", texto: "Regla rota" }],
    ["chiave scritta male", { campo: "calc.edad", op: "<=", valor: 99, texto: "Regla rota", no_concluyent: ["no_cumple"] }],
    ["no_concluyente non valido", { campo: "calc.edad", op: "<=", valor: 99, texto: "Regla rota", no_concluyente: ["quizas"] }],
    ["senza texto", { campo: "calc.edad", op: "<=", valor: 99 }],
    ["any_of vuoto", { any_of: [], texto: "Grupo roto" }],
    ["any_of e all_of insieme", { any_of: [{ campo: "calc.edad", op: "<=", valor: 99, texto: "Ok" }], all_of: [], texto: "Grupo roto" }],
    ["nodo che non è un oggetto", "calc.edad <= 35"],
  ];
  for (const [nome, regla] of cattive) {
    test(nome, () => {
      const cat = catalogoCon([{ ...clona(base), requisitos: [regla, { campo: "calc.edad", op: ">=", valor: 0, texto: "Tener 0 años o más" }] }]);
      for (const p of [LUCIA, RODRIGO, VACIO]) {
        const v = evaluar(cat, p, HOY).fichas[0];
        const r = v.requisitos[0];
        assert.equal(r.resultado, "falta_dato");
        assert.equal(r.motivo, "regla_no_valida");
        assert.equal(r.aclaracion, "No hemos podido comprobar este requisito: léelo en la fuente.");
        assert.deepEqual(r.faltan, []);
        assert.notEqual(v.estado, "encaja");
      }
    });
  }
  // Un gruppo di paesi che lo schema rifiuterebbe (catalogo.schema.json, grupos_paises:
  // minItems 1, uniqueItems, pattern ^[A-Z]{2}$) rende non valida la regola che lo usa.
  const gruppiRotti = [
    ["gruppo di paesi vuoto", [], { campo: "persona.nacionalidades", op: "contains_any", valor_grupo: "V", texto: "Regla rota" }],
    ["gruppo di paesi con un codice minuscolo", ["es"], { campo: "residencia.pais", op: "in", valor_grupo: "V", texto: "Regla rota" }],
    ["gruppo di paesi con un codice ripetuto", ["ES", "ES"], { campo: "residencia.pais", op: "not_in", valor_grupo: "V", texto: "Regla rota" }],
  ];
  for (const [nome, gruppo, regla] of gruppiRotti) {
    test(nome, () => {
      const cat = catalogoCon([{ ...clona(base), requisitos: [regla] }]);
      cat.grupos_paises = { ...GRUPOS, V: gruppo };
      const prof = con(con(VACIO, "persona.nacionalidades", ["ES"]), "residencia.pais", "ES");
      for (const p of [prof, LUCIA, RODRIGO, VACIO]) {
        const v = evaluar(cat, p, HOY).fichas[0];
        const r = v.requisitos[0];
        assert.equal(r.resultado, "falta_dato");
        assert.equal(r.motivo, "regla_no_valida");
        assert.equal(r.aclaracion, "No hemos podido comprobar este requisito: léelo en la fuente.");
        assert.equal(v.estado, "falta_dato");
      }
    });
  }
  test("una regola rotta dentro un all_of: il gruppo eredita il motivo e l'aclaracion", () => {
    const cat = catalogoCon([{ ...clona(base), requisitos: [{ all_of: [
      { campo: "calc.edad", op: "<=", valor: 99, texto: "Tener 99 años o menos" },
      { campo: "inventado", op: "==", valor: 1, texto: "Regla rota" },
    ], texto: "Grupo" }] }]);
    const r = evaluar(cat, LUCIA, HOY).fichas[0].requisitos[0];
    assert.deepEqual(r, { texto: "Grupo", resultado: "falta_dato", motivo: "regla_no_valida",
      aclaracion: "No hemos podido comprobar este requisito: léelo en la fuente.", faltan: [] });
  });
  // Contrato: il motivo di un gruppo è quello del PRIMO figlio con lo stesso resultado.
  // Due figli falta_dato con motivi diversi, in tutti e due gli ordini.
  const nacido = con(con(VACIO, "persona.anio_nacimiento", 1998), "persona.mes_nacimiento", 3);
  const figlioNc = { campo: "calc.edad", op: "<=", valor: 10, texto: "Tener 10 años o menos",
    no_concluyente: ["no_cumple"], aclaracion: "Aclaración de la primera regla" };
  const figlioFalta = { campo: "hogar.miembros", op: ">=", valor: 1, texto: "Vivir con alguien" };
  for (const chiave of ["all_of", "any_of"]) {
    test(`${chiave}: motivo e aclaracion vengono dal primo figlio falta_dato (no_concluyente prima)`, () => {
      const cat = catalogoCon([{ ...clona(base), requisitos: [{ [chiave]: [clona(figlioNc), clona(figlioFalta)], texto: "Grupo" }] }]);
      const r = evaluar(cat, nacido, HOY).fichas[0].requisitos[0];
      assert.deepEqual(r, { texto: "Grupo", resultado: "falta_dato", motivo: "no_concluyente",
        aclaracion: "Aclaración de la primera regla", faltan: ["hogar.miembros"] });
    });
    test(`${chiave}: motivo e aclaracion vengono dal primo figlio falta_dato (falta prima)`, () => {
      const cat = catalogoCon([{ ...clona(base), requisitos: [{ [chiave]: [clona(figlioFalta), clona(figlioNc)], texto: "Grupo" }] }]);
      const r = evaluar(cat, nacido, HOY).fichas[0].requisitos[0];
      assert.deepEqual(r, { texto: "Grupo", resultado: "falta_dato", motivo: "falta",
        aclaracion: null, faltan: ["hogar.miembros"] });
    });
  }
  test("requisitos che non è una lista → la scheda resta visibile come falta_dato", () => {
    const cat = catalogoCon([{ ...clona(base), requisitos: "todos" }]);
    const v = evaluar(cat, LUCIA, HOY).fichas[0];
    assert.equal(v.estado, "falta_dato");
    assert.equal(v.requisitos[0].motivo, "regla_no_valida");
  });
  test("requisitos [] → encaja (scheda per chiunque) e razones []", () => {
    const cat = catalogoCon([{ ...clona(base), requisitos: [] }]);
    const v = evaluar(cat, VACIO, HOY).fichas[0];
    assert.equal(v.estado, "encaja");
    assert.deepEqual(v.razones, []);
  });
});

describe("filtro di territorio (§6.4)", () => {
  test("Lucía (ES-VC): nascosta solo la scheda di Madrid", () => {
    const res = evaluar(CAT_TEST, LUCIA, HOY);
    assert.equal(res.ocultas_por_territorio, 1);
    assert.equal(voce(res, "es-md-prueba-territorio"), undefined);
    assert.ok(voce(res, "eu-prueba-territorio"));
  });
  test("chi vive in Francia vede solo le schede EU", () => {
    const p = con(con(VACIO, "residencia.pais", "FR"), "residencia.region", "FR-IDF");
    const res = evaluar(CAT_TEST, p, HOY);
    assert.deepEqual(res.fichas.map((v) => v.id), ["eu-prueba-territorio"]);
    assert.equal(res.ocultas_por_territorio, FICHAS_TEST.length - 1);
  });
  test("paese ES senza regione: si vedono le schede di tutte le comunità", () => {
    const res = evaluar(CAT_TEST, con(VACIO, "residencia.pais", "ES"), HOY);
    assert.equal(res.ocultas_por_territorio, 0);
  });
  test("regione no_lo_se e paese ES: come senza regione", () => {
    const p = con(con(VACIO, "residencia.pais", "ES"), "residencia.region", "no_lo_se");
    assert.equal(evaluar(CAT_TEST, p, HOY).ocultas_por_territorio, 0);
  });
});

describe("ordine, purezza e determinismo", () => {
  const chiave = (v, nome) => [v.apertura === "cerrada" ? 1 : 0, { derecho: 0, oportunidad: 1 }[v.tipo],
    { encaja: 0, falta_dato: 1, no_encaja: 2 }[v.estado], v.proximo_plazo === null ? 1 : 0, v.proximo_plazo ?? "", nome];
  const nomi = Object.fromEntries(FICHAS_TEST.map((f) => [f.id, f.nombre]));

  for (const [nome, perfil] of [["Lucía", LUCIA], ["Rodrigo", RODRIGO], ["vuoto", VACIO]]) {
    test(`l'array esce ordinato come da contratto (${nome})`, () => {
      for (const hoy of ["2026-10-14", "2026-10-25", "2027-01-15"]) {
        const res = evaluar(CAT_TEST, perfil, hoy);
        for (let i = 1; i < res.fichas.length; i++) {
          const a = chiave(res.fichas[i - 1], nomi[res.fichas[i - 1].id]);
          const b = chiave(res.fichas[i], nomi[res.fichas[i].id]);
          let cmp = 0;
          for (let k = 0; k < a.length && cmp === 0; k++) {
            cmp = k === 5 ? a[k].localeCompare(b[k], "es") : a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0;
          }
          assert.ok(cmp <= 0, `${hoy}: ${res.fichas[i - 1].id} prima di ${res.fichas[i].id}`);
        }
      }
    });
  }
  test("l'ordine delle schede nel catalogo non cambia l'uscita", () => {
    const rovescio = catalogoCon([...FICHAS_TEST].reverse());
    assert.deepStrictEqual(evaluar(rovescio, LUCIA, HOY), evaluar(CAT_TEST, LUCIA, HOY));
  });
  test("stesso input, stessa uscita; catalogo e profilo non modificati", () => {
    const cat = clona(CAT_TEST);
    const p = clona(RODRIGO);
    const a = evaluar(cat, p, HOY);
    const b = evaluar(cat, p, HOY);
    assert.deepStrictEqual(a, b);
    assert.deepStrictEqual(cat, CAT_TEST);
    assert.deepStrictEqual(p, RODRIGO);
  });
  test("input strani non lanciano eccezioni", () => {
    for (const [c, p, h] of [[null, null, HOY], [{}, {}, HOY], [CAT_TEST, "x", HOY],
      [CAT_TEST, LUCIA, "14/10/2026"], [CAT_TEST, LUCIA, undefined], [{ fichas: [null, 3, "x"] }, LUCIA, HOY],
      [{ fichas: [{}] }, LUCIA, HOY]]) {
      const res = evaluar(c, p, h);
      assert.ok(Array.isArray(res.fichas));
      assert.deepEqual(Object.keys(res.perfil_calculado), CALC);
      controllaForma(res);
    }
  });
  test("con hoy non valido nessuna scheda con date è encaja e tutte sono por_revisar", () => {
    const res = evaluar(CAT_EJEMPLO, LUCIA, "2026-13-01");
    for (const v of res.fichas) {
      assert.equal(v.por_revisar, true);
      assert.equal(v.apertura, "desconocida");
    }
    assert.equal(voce(res, "es-vc-bono-alquiler-joven-2026").estado, "falta_dato");
  });
  test("il sorgente non tocca DOM, rete, console, orologio, storage", () => {
    const src = readFileSync(new URL("web/js/motor.js", RAIZ), "utf8");
    // La stessa espressione del grep del tester, più gli altri accessi vietati.
    assert.doesNotMatch(src, /console\.|window|document|fetch/);
    for (const proibito of [/globalThis/,
      /\bDate\b/, /Math\.random/, /localStorage/, /sessionStorage/, /\bimport\b/, /\brequire\(/]) {
      assert.doesNotMatch(src, proibito);
    }
  });
});

// ---------------------------------------------------------------------------
// Monotonia dell'informazione: togliere un dato (o metterlo a «no_lo_se») può solo
// lasciare l'esito com'era o farlo diventare falta_dato. Mai il contrario, mai da
// falta_dato a encaja, mai da no_encaja a encaja.

function foglie(obj, prefisso = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefisso ? `${prefisso}.${k}` : k;
    if (["esquema", "version", "actualizado_el", "ejemplo", "solicitudes", "intereses"].includes(p)) continue;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) out.push(...foglie(v, p));
    else out.push(p);
  }
  return out;
}

function confrontaMonotono(prima, dopo, etichetta) {
  const pv = Object.fromEntries(prima.fichas.map((v) => [v.id, v]));
  for (const d of dopo.fichas) {
    const p = pv[d.id];
    if (!p) continue; // visibile solo perché il territorio ora manca
    assert.ok(d.estado === p.estado || d.estado === "falta_dato",
      `${etichetta} ${d.id}: ${p.estado} → ${d.estado}`);
    d.requisitos.forEach((r, i) => {
      const q = p.requisitos[i];
      assert.ok(r.resultado === q.resultado || r.resultado === "falta_dato",
        `${etichetta} ${d.id} riga ${i}: ${q.resultado} → ${r.resultado}`);
    });
  }
}

describe("monotonia: meno dati non danno mai più encaja", () => {
  const basi = { Lucía: LUCIA, Rodrigo: RODRIGO, ...PERFILES };
  for (const [nome, base] of Object.entries(basi)) {
    test(`togliere o mettere a «no lo sé» ogni campo di ${nome}`, () => {
      for (const hoy of ["2026-10-14", "2027-01-15"]) {
        const prima = evaluar(CAT_TEST, base, hoy);
        for (const campo of foglie(base)) {
          for (const nuovo of [undefined, "no_lo_se"]) {
            const dopo = evaluar(CAT_TEST, con(base, campo, nuovo), hoy);
            controllaForma(dopo);
            confrontaMonotono(prima, dopo, `${nome} ${hoy} ${campo}=${nuovo}`);
          }
        }
      }
    });
  }
  test("300 profili con più campi tolti a caso (seme fisso)", () => {
    let seme = 20261014;
    const caso = () => ((seme = (seme * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let n = 0; n < 300; n++) {
      const base = n % 2 ? LUCIA : RODRIGO;
      const campi = foglie(base);
      let p = clona(base);
      const tolti = [];
      for (const c of campi) {
        if (caso() < 0.3) {
          const nuovo = caso() < 0.5 ? undefined : "no_lo_se";
          p = con(p, c, nuovo);
          tolti.push(c);
        }
      }
      const hoy = n % 3 ? "2026-10-14" : "2027-01-15";
      confrontaMonotono(evaluar(CAT_TEST, base, hoy), evaluar(CAT_TEST, p, hoy), `caso ${n} [${tolti}]`);
    }
  });
});

describe("afiliación: il sindacato non è un codice valido (art. 9 GDPR)", () => {
  // Scheda inventata: chiede l'iscrizione a un collegio professionale. Il valore «sindicato»
  // non deve mai dare encaja né no_encaja: l'adesione sindacale non è un dato che il sito chiede.
  const FICHA_AFILIACION = {
    ...ficha("es-prueba-sin-hijos"),
    id: "es-prueba-afiliacion",
    requisitos: [{
      campo: "vinculos.afiliaciones", op: "contains", valor: "colegio_profesional",
      texto: "Estar colegiada o colegiado",
    }],
  };
  const CAT_AFILIACION = catalogoCon([FICHA_AFILIACION]);

  test("«sindicato» nel profilo è dato non valido, quindi falta_dato, mai no_encaja", () => {
    const p = con(VACIO, "vinculos.afiliaciones", ["sindicato"]);
    const res = evaluar(CAT_AFILIACION, p, HOY);
    controllaForma(res);
    const v = voce(res, "es-prueba-afiliacion");
    assert.equal(v.estado, "falta_dato");
    assert.equal(v.requisitos[0].motivo, "dato_no_valido");
    assert.notEqual(v.estado, "no_encaja");
  });

  test("«colegio_profesional» nel profilo è un codice valido: encaja", () => {
    const p = con(VACIO, "vinculos.afiliaciones", ["colegio_profesional"]);
    const v = voce(evaluar(CAT_AFILIACION, p, HOY), "es-prueba-afiliacion");
    assert.equal(v.estado, "encaja");
  });
});

// ---------------------------------------------------------------------------------------------
// Catalogo vero (catalogo/fichas/): L14-2. Non usa web/data/catalogo.json (artefatto di build)
// ma le schede sorgente. TAMIZ_FICHAS_DIR permette di puntare a un'altra cartella (prova rossa).
const DIR_FICHAS_REALES = process.env.TAMIZ_FICHAS_DIR
  ? new URL(process.env.TAMIZ_FICHAS_DIR.replace(/\/?$/, "/"), "file://")
  : new URL("catalogo/fichas/", RAIZ);
const FICHAS_REALES = readdirSync(DIR_FICHAS_REALES).filter((f) => f.endsWith(".json")).sort()
  .map((f) => JSON.parse(readFileSync(new URL(f, DIR_FICHAS_REALES), "utf8")));
const CAT_REAL = catalogoCon(FICHAS_REALES);

describe("catalogo vero: capitalización resta fuori dal catalogo pubblico", () => {
  // Il profilo non distingue la prestazione contributiva dal subsidio: con la regola su
  // cobra_prestacion chi riceve un subsidio avrebbe «Parece que encajas», ma non può
  // capitalizzare. Finché il profilo non ha quel dato la scheda sta in por-revisar/.
  test("es-sepe-capitalizacion-prestacion-desempleo non è fra le schede pubblicate", () => {
    assert.equal(FICHAS_REALES.some((x) => x.id === "es-sepe-capitalizacion-prestacion-desempleo"), false);
  });
});

describe("catalogo vero: bono social e comedor non danno mai encaja con reddito mancante o sopra soglia", () => {
  for (const id of ["es-bono-social-electrico", "es-vc-ayuda-comedor-escolar"]) {
    test(`${id}: reddito mancante`, () => {
      let p = con(RODRIGO, "ingresos.hogar", undefined);
      p = con(p, "ingresos.individual", undefined);
      p = con(p, "hogar.familia_numerosa", undefined);
      assert.notEqual(voce(evaluar(CAT_REAL, p, HOY), id).estado, "encaja");
    });
    test(`${id}: reddito del nucleo molto sopra soglia`, () => {
      let p = con(RODRIGO, "ingresos.hogar", { importe: 200000 });
      p = con(p, "hogar.familia_numerosa", undefined);
      assert.notEqual(voce(evaluar(CAT_REAL, p, HOY), id).estado, "encaja");
    });
  }
});

describe("catalogo vero: homologación e LABORA", () => {
  test("homologación: nivel doctorado non dà encaja", () => {
    let p = con(RODRIGO, "estudios.titulo_extranjero", true);
    p = con(p, "estudios.nivel_max", "doctorado");
    assert.notEqual(voce(evaluar(CAT_REAL, p, HOY), "es-homologacion-titulo-universitario-extranjero").estado, "encaja");
  });
  test("LABORA: retrocessa, non è nelle schede pubblicate e il motore non le dà nessun esito", () => {
    const ID = "es-labora-formacion-becas-desempleados";
    assert.equal(FICHAS_REALES.find((x) => x.id === ID), undefined, "non deve stare in catalogo/fichas/");
    const pub = leer("web/data/catalogo.json");
    assert.equal(pub.fichas.find((x) => x.id === ID), undefined, "non deve stare in web/data/catalogo.json");
    // Rodrigo non è iscritto come demandante: con la scheda pubblicata dava «no encaja» per un corso già fatto.
    assert.equal(voce(evaluar(CAT_REAL, RODRIGO, HOY), ID), undefined);
    assert.equal(voce(evaluar(CAT_REAL, con(RODRIGO, "empleo.inscrito_demandante", true), HOY), ID), undefined);
    assert.doesNotMatch(readFileSync(new URL("web/fuentes.html", RAIZ), "utf8"), /LABORA/);
    assert.doesNotMatch(readFileSync(new URL("web/calendario.ics", RAIZ), "utf8"), /LABORA/i);
  });
  // catalogo/por-revisar/ non si pubblica: nell'esportazione questa prova non ha il file e salta.
  const PR_LABORA = new URL("catalogo/por-revisar/es-labora-formacion-becas-desempleados.json", RAIZ);
  test("LABORA: in por-revisar con confianza media, motivi scritti e nessuna regola sullo stato di oggi", { skip: !existsSync(PR_LABORA) }, () => {
    const f = leer("catalogo/por-revisar/es-labora-formacion-becas-desempleados.json");
    assert.equal(f.confianza, "media");
    assert.match(f._revisar.join(" "), /10338/);
    assert.equal(f.plazo.verificado, false);
    assert.equal(JSON.stringify(f.requisitos), "[]", "l'iscrizione il giorno d'inizio del corso non si misura con lo stato di oggi");
    assert.match(f.requisitos_no_evaluables.join(" "), /el día en que empiezas el curso/);
    assert.match(f.requisitos_no_evaluables.join(" "), /completado y superado/);
    assert.match(f.cuantia.texto, /presencialmente/);
  });
  test("nessuna scheda pubblicata ha il requisito centrale non valutabile né plazo sconosciuto", () => {
    for (const f of FICHAS_REALES) {
      assert.notEqual(f.plazo.tipo, "desconocido", `${f.id}: plazo sconosciuto con confianza alta`);
      assert.doesNotMatch(f.requisitos_no_evaluables.join(" "), /requisito central/i, `${f.id}: requisito centrale non valutabile`);
    }
  });
});
