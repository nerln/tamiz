// Prove di scripts/validar.py e della lista delle aree (L20-2).
// validar.py si lancia come processo su schede sintetiche scritte in una cartella temporanea:
// nessun dato vero di nessuno, niente scritto nel repo.
//
//   node --test            (dalla radice del repo)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { AREAS } from "../web/js/motor.js";

const RAIZ = new URL("../", import.meta.url);
const RAIZ_PATH = fileURLToPath(RAIZ);
const leer = (rel) => JSON.parse(readFileSync(new URL(rel, RAIZ), "utf8"));
const clona = (o) => JSON.parse(JSON.stringify(o));

// Il validatore interno (python3 di sistema) e, se la variabile TAMIZ_PYTHON_JSONSCHEMA indica
// un python con jsonschema, anche quello. Senza la variabile questo caso si salta.
const PYJS = process.env.TAMIZ_PYTHON_JSONSCHEMA || "";
const PYTHONS = ["python3", ...(PYJS && existsSync(PYJS) ? [PYJS] : [])];

const TMP = mkdtempSync(join(tmpdir(), "tamiz-validar-"));
let n = 0;
function valida(python, ficha) {
  // La cartella si chiama fichas/ come quella vera, così vale anche il controllo di confianza alta.
  const dir = join(TMP, String(n++), "fichas");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${ficha.id}.json`);
  writeFileSync(file, JSON.stringify(ficha, null, 2));
  const r = spawnSync(python, ["scripts/validar.py", file], { cwd: RAIZ_PATH, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

// Base: una scheda vera e valida, copiata e rinominata (id di prova).
const BASE = { ...leer("catalogo/fichas/es-aei-fpu-2026.json"), id: "es-prueba-validar" };

for (const py of PYTHONS) {
  describe(`validar.py su schede sintetiche (${py})`, () => {
    test("la scheda di base è valida", () => {
      const r = valida(py, BASE);
      assert.equal(r.status, 0, r.out);
    });
    test("requisitos [] in una scheda non informativa → ROSSO", () => {
      const r = valida(py, { ...clona(BASE), requisitos: [] });
      assert.equal(r.status, 1, r.out);
      assert.match(r.out, /requisitos: lista vuota in una scheda non informativa/);
    });
    test("la stessa con informativa: true → VERDE", () => {
      const r = valida(py, { ...clona(BASE), requisitos: [], informativa: true });
      assert.equal(r.status, 0, r.out);
    });
    test("area mancante → ROSSO", () => {
      const f = clona(BASE);
      delete f.area;
      const r = valida(py, f);
      assert.equal(r.status, 1, r.out);
      assert.match(r.out, /area/);
    });
    test("area fuori dalle 12 → ROSSO", () => {
      const r = valida(py, { ...clona(BASE), area: "deportes" });
      assert.equal(r.status, 1, r.out);
      assert.match(r.out, /area/);
    });
    test("plazo.mes_habitual 13 → ROSSO, 10 → VERDE", () => {
      const f = clona(BASE);
      f.plazo.mes_habitual = 13;
      const r = valida(py, f);
      assert.equal(r.status, 1, r.out);
      assert.match(r.out, /mes_habitual/);
      f.plazo.mes_habitual = 10;
      assert.equal(valida(py, f).status, 0);
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Le 12 aree sono scritte in tre posti: lo schema (fonte), AREAS nel motore, ESQUEMA.md.
describe("le 12 aree: schema, motore e documento dicono la stessa lista", () => {
  const ENUM = leer("schema/catalogo.schema.json").$defs.ficha.properties.area.enum;
  test("lo schema ha 12 aree", () => assert.equal(ENUM.length, 12));
  test("AREAS del motore = enum dello schema, nello stesso ordine", () => {
    assert.deepEqual([...AREAS], ENUM);
  });
  test("AREAS non si può modificare da fuori", () => assert.ok(Object.isFrozen(AREAS)));
  test("la riga di `area` in ESQUEMA.md elenca le stesse aree, nello stesso ordine", () => {
    const doc = readFileSync(new URL("docs/ESQUEMA.md", RAIZ), "utf8");
    const riga = doc.split("\n").find((l) => l.startsWith("| `area` | sì | enum |"));
    assert.ok(riga, "manca la riga di area nella tabella della scheda");
    const elenco = riga.split(":")[1].split("(")[0];
    assert.deepEqual([...elenco.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]), ENUM);
  });
});

// ---------------------------------------------------------------------------------------------
// DEBITO DICHIARATO (L20-2). L20 ha reso `area` obbligatoria, ma le tre schede del catalogo
// segnaposto in schema/esempi/fichas/ non sono fra i file che il lotto può toccare e non l'hanno.
// Finché un lotto non aggiunge `area` (empleo, investigacion, vivienda: le stesse di tests/fichas/),
// `validar.py schema/esempi/fichas` e `construir.py --ejemplo` sono ROSSI. Questa prova è `todo`:
// gira, si vede come fallita nel resoconto di node --test, ma non rende rossa la suite.
// Quando le tre schede avranno area: togliere `todo` qui e il rattoppo in CAT_ESEMPI
// (tests/motor.test.mjs).
describe("schema/esempi/fichas/ (catalogo segnaposto)", () => {
  test("validar.py è verde sulle tre schede d'esempio", {
    todo: "debito L20: le tre schede di schema/esempi/fichas/ non hanno area",
  }, () => {
    const r = spawnSync("python3", ["scripts/validar.py", "schema/esempi/fichas"],
      { cwd: RAIZ_PATH, encoding: "utf8" });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  });
});
