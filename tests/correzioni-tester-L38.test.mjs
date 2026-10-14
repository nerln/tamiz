// Prove delle correzioni L38 al questionario (segnalazioni a, b e la regola generale sul «No lo sé»).
// Dalla radice della copia: node --test tests/*.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { FABRICA, opcionesConNoSe, opcionesPaisMenu } from "../web/js/ui/cuestionario.js";
import { PANTALLAS } from "../web/js/preguntas.js";

const NLS = "no_lo_se";

describe("segnalazione a: «No lo sé» visibile in cima ai menu lunghi", () => {
  test("menu di paesi: «No lo sé» subito dopo «Elige un país», non in fondo a 69 voci", () => {
    const menu = opcionesPaisMenu();
    assert.equal(menu[0][0], "");
    assert.equal(menu[1][0], NLS);
  });

  test("ogni menu con «No lo sé» lo porta in cima, dopo il segnaposto, senza perdere altre voci", () => {
    const lista = [["a", "A"], ["b", "B"], [NLS, "No lo sé"], ["c", "C"]];
    const ordinata = opcionesConNoSe(lista);
    assert.equal(ordinata[0][0], NLS);
    assert.equal(ordinata.length, lista.length);
    assert.deepEqual(ordinata.slice(1).map((x) => x[0]), ["a", "b", "c"]);
  });
});

describe("regola generale: ogni domanda con un messaggio che nomina «No lo sé» offre l'opzione in vista", () => {
  test("tutti i menu del questionario con «No lo sé» lo mettono nei primi posti", () => {
    let controlliConNls = 0;
    for (const p of PANTALLAS) {
      for (const c of p.controles) {
        const opciones = Array.isArray(c.opciones) ? c.opciones : null;
        if (!opciones || !opciones.some(([v]) => v === NLS)) continue;
        if (c.tipo !== "select" && c.tipo !== "radio" && c.tipo !== "lista") continue;
        controlliConNls++;
        if (c.tipo !== "select") continue;
        const ordinata = opcionesConNoSe(opciones);
        assert.equal(ordinata[0][0], NLS, `${c.campo || c.base}: «No lo sé» non è in cima al menu`);
      }
    }
    assert.ok(controlliConNls > 0);
  });

  test("ogni controllo il cui messaggio d'errore nomina «No lo sé» ha l'opzione «No lo sé» nel codice", () => {
    for (const [tipo, fn] of Object.entries(FABRICA)) {
      const src = fn.toString();
      if (!/marca «|o «No lo sé»/.test(src)) continue;
      assert.ok(/"No lo sé"| No lo sé"|opcionesPaisMenu|opcionesConNoSe/.test(src), `il controllo ${tipo} nomina «No lo sé» ma non lo offre`);
    }
  });
});

describe("segnalazione b: una scelta singola si può togliere", () => {
  test("radio e Sí/No/No lo sé hanno il pulsante «Quitar respuesta»", () => {
    assert.match(FABRICA.radio.toString(), /Quitar respuesta/);
    assert.match(FABRICA.bool.toString(), /Quitar respuesta/);
  });
});

describe("segnalazione c: aggiungere un figlio toglie «nessuno» e «No lo sé»", () => {
  test("Añadir hijo o hija spunta via «No tengo hijos» e «No lo sé»", () => {
    assert.match(FABRICA.hijos.toString(), /ninguno\.checked = false;\s*nls\.checked = false;\s*agregar\(null\)/);
  });
});

describe("minori: testi e messaggi", () => {
  test("il testo d'aiuto di Otra situación non dice di lasciare il campo vuoto", () => {
    const src = FABRICA.radio.toString() + FABRICA.bool.toString();
    assert.doesNotMatch(src, /Deja el campo vacío/);
  });

  test("il messaggio d'errore del testo non raddoppia la punteggiatura", () => {
    assert.match(FABRICA.texto.toString(), /replace\(\/\\\.\$\/, ""\)/);
  });
});
