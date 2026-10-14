// Prove di scripts/analytics.py: il conteggio delle visite segue il token di sitio.json.
// Lavora su una copia di web/ e di sitio.json in una cartella temporanea: niente scritto nel repo.
//
//   node --test            (dalla radice del repo)

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, cpSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const SCRIPT = join(RAIZ, "scripts", "analytics.py");
const TOKEN = "ee2940af484d46e494d956e6ae0181d7";
const BEACON = "https://static.cloudflareinsights.com/beacon.min.js";
const CSP_PIENA = "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; connect-src 'self' https://cloudflareinsights.com";
const CSP_VUOTA = "default-src 'self'";
const FRASE_VISITE = "Tus respuestas nunca forman parte de la dirección de la página, así que no llegan a Cloudflare";

function copia(token) {
  const dir = mkdtempSync(join(tmpdir(), "tamiz-analitica-"));
  cpSync(join(RAIZ, "web"), join(dir, "web"), { recursive: true });
  const sitio = JSON.parse(readFileSync(join(RAIZ, "sitio.json"), "utf8"));
  sitio.analytics = { cloudflare_token: token };
  writeFileSync(join(dir, "sitio.json"), JSON.stringify(sitio, null, 2));
  return dir;
}

function py(dir, ...args) {
  return spawnSync("python3", [SCRIPT, "--radice", dir, ...args], { encoding: "utf8" });
}

function file(dir) {
  const out = [];
  const visita = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) visita(p);
      else out.push(p);
    }
  };
  visita(join(dir, "web"));
  return out;
}

const paginas = (dir) => file(dir).filter((p) => p.endsWith(".html"));
const leggi = (p) => readFileSync(p, "utf8");
const privacidad = (dir) => leggi(join(dir, "web", "privacidad.html"));

describe("token pieno", () => {
  test("ogni pagina ha lo script di Cloudflare una volta e la CSP dei due host", () => {
    const dir = copia(TOKEN);
    const r = py(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const pagine = paginas(dir);
    assert.equal(pagine.length, 16, "8 pagine in spagnolo e 8 in web/en/");
    for (const p of pagine) {
      const html = leggi(p);
      assert.equal(html.split(BEACON).length - 1, 1, p);
      assert.ok(html.includes(`data-cf-beacon='{"token":"${TOKEN}"}'`), p);
      assert.ok(html.includes(`content="${CSP_PIENA}"`), p);
    }
  });

  test("privacidad.html nomina il servizio e dice che le risposte non arrivano", () => {
    const dir = copia(TOKEN);
    assert.equal(py(dir).status, 0);
    const html = privacidad(dir);
    assert.ok(html.includes("Cloudflare Web Analytics"));
    assert.ok(html.includes(FRASE_VISITE));
  });

  test("--controlla è verde e --stato dice pieno", () => {
    const dir = copia(TOKEN);
    assert.equal(py(dir).status, 0);
    assert.equal(py(dir, "--controlla").status, 0);
    const stato = py(dir, "--stato");
    assert.equal(stato.status, 0);
    assert.equal(stato.stdout.trim(), "pieno");
  });

  test("allineare una seconda volta non cambia niente", () => {
    const dir = copia(TOKEN);
    assert.equal(py(dir).status, 0);
    const prima = paginas(dir).map(leggi);
    const r = py(dir);
    assert.match(r.stdout, /già allineato/);
    assert.deepEqual(paginas(dir).map(leggi), prima);
  });
});

describe("token vuoto", () => {
  test("allineare toglie script e host da tutte le pagine e torna la CSP di prima", () => {
    // Passa da pieno a vuoto: il token cambia in sitio.json e si rialinea la stessa cartella.
    const dir = copia(TOKEN);
    assert.equal(py(dir).status, 0);
    const sitio = JSON.parse(readFileSync(join(dir, "sitio.json"), "utf8"));
    sitio.analytics.cloudflare_token = "";
    writeFileSync(join(dir, "sitio.json"), JSON.stringify(sitio, null, 2));
    assert.equal(py(dir).status, 0);
    for (const p of file(dir)) {
      assert.doesNotMatch(leggi(p), /cloudflareinsights/i, p);
    }
    for (const p of paginas(dir)) {
      assert.ok(leggi(p).includes(`content="${CSP_VUOTA}"`), p);
    }
    const html = privacidad(dir);
    assert.ok(!html.includes("Cloudflare Web Analytics"));
    assert.ok(!html.includes(FRASE_VISITE));
  });

  test("--controlla è verde e --stato dice vuoto", () => {
    const dir = copia("");
    assert.equal(py(dir).status, 0);
    assert.equal(py(dir, "--controlla").status, 0);
    const stato = py(dir, "--stato");
    assert.equal(stato.status, 0);
    assert.equal(stato.stdout.trim(), "vuoto");
  });
});

describe("regole che fanno fallire", () => {
  test("una pagina senza lo script fa fallire --controlla", () => {
    const dir = copia(TOKEN);
    assert.equal(py(dir).status, 0);
    const p = join(dir, "web", "avisos.html");
    writeFileSync(p, leggi(p).replace(new RegExp(`\\s*<script defer src="${BEACON}"[^>]*></script>`), ""));
    const r = py(dir, "--controlla");
    assert.equal(r.status, 1);
    assert.match(r.stdout, /avisos\.html/);
  });

  test("una privacy che non nomina il servizio fa fallire --controlla", () => {
    const dir = copia(TOKEN);
    assert.equal(py(dir).status, 0);
    const p = join(dir, "web", "privacidad.html");
    writeFileSync(p, leggi(p).replaceAll("Cloudflare Web Analytics", "analítica web"));
    const r = py(dir, "--controlla");
    assert.equal(r.status, 1);
    assert.match(r.stdout, /privacidad/);
  });

  test("un token che non è esadecimale viene rifiutato", () => {
    const dir = copia("ee29-non-valido");
    const r = py(dir, "--stato");
    assert.equal(r.status, 2);
  });
});
