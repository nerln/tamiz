#!/usr/bin/env python3
"""Prove di scripts/vigia.py: segnali, impronte, sigillatura, issue (con un gh finto) e formato di vigia.json.

Dati sintetici in cartelle temporanee e un server HTTP locale finto per le fonti. Nessun dato vero,
nessuna rete esterna.

Uso:
    python3 tests/test_vigia.py                       # prova lo script del repository
    TAMIZ_VIGIA_SCRIPT=altro/vigia.py python3 tests/test_vigia.py

Lo script gira come processo a sé, con --raiz su una cartella temporanea: non tocca il repository.
"""

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.parse
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SCRIPT = Path(os.environ.get("TAMIZ_VIGIA_SCRIPT", RAIZ / "scripts" / "vigia.py"))
HOY = date(2026, 10, 15)
BOT = {"is_bot": True, "login": "app/github-actions"}  # come lo restituisce gh issue list --json author
CLAVES_DOC = {"generado_el", "total_fichas", "con_senales", "fichas", "no_comprobadas", "sin_huella"}
TIPOS = {"revision_vencida", "plazo_pasado", "nueva_edicion_esperada", "posible_convocatoria_nueva", "fuente_cambiada"}

spec = importlib.util.spec_from_file_location("vigia_modulo", SCRIPT)
V = importlib.util.module_from_spec(spec)
spec.loader.exec_module(V)

# --- Server HTTP finto per le fonti ---------------------------------------------------------------

RUTAS = {}  # ruta -> (stato, content-type, bytes), oppure una funzione che restituisce la terna


class Finto(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        cfg = RUTAS.get(urllib.parse.urlparse(self.path).path)
        if cfg is None:
            stato, tipo, cuerpo = 404, "text/plain", b"no existe"
        elif callable(cfg):
            stato, tipo, cuerpo = cfg()
        else:
            stato, tipo, cuerpo = cfg
        self.send_response(stato)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(cuerpo)))
        self.end_headers()
        self.wfile.write(cuerpo)


SERVIDOR = ThreadingHTTPServer(("127.0.0.1", 0), Finto)
BASE = f"http://127.0.0.1:{SERVIDOR.server_address[1]}"
threading.Thread(target=SERVIDOR.serve_forever, daemon=True).start()


def html(texto, extra=""):
    return f"<html lang=\"es\"><head>{extra}</head><body><p>{texto}</p></body></html>".encode("utf-8")


# --- Cartelle e schede sintetiche ------------------------------------------------------------------

def ficha(id_, nombre="Ayuda de prueba", **extra):
    base = {"id": id_, "nombre": nombre, "fuente": BASE + "/sin-huella", "url_oficial": BASE + "/sin-huella",
            "revisar_antes_de": "2027-06-01", "verificado_el": None, "leido_por_agente": "2026-10-14",
            "bdns": None, "plazo": {"tipo": "abierto_todo_el_ano", "fuente": BASE + "/sin-huella"}}
    base.update(extra)
    return base


def crear_raiz(fichas, convocatorias=None, huellas=None, crudas=None):
    raiz = Path(tempfile.mkdtemp(prefix="vigia-prova-"))
    (raiz / "catalogo" / "fichas").mkdir(parents=True)
    (raiz / "web" / "data").mkdir(parents=True)
    for f in fichas:
        (raiz / "catalogo" / "fichas" / f"{f['id']}.json").write_text(json.dumps(f, ensure_ascii=False), encoding="utf-8")
    for nombre, texto in (crudas or {}).items():
        (raiz / "catalogo" / "fichas" / nombre).write_text(texto, encoding="utf-8")
    if convocatorias is not None:
        doc = {"generado_el": "2026-10-14T10:00:00+02:00", "convocatorias": convocatorias}
        (raiz / "web" / "data" / "indice.json").write_text(json.dumps(doc, ensure_ascii=False), encoding="utf-8")
    if huellas is not None:
        (raiz / "catalogo" / "vigia-huellas.json").write_text(json.dumps(huellas, ensure_ascii=False), encoding="utf-8")
    return raiz


def ejecutar(raiz, *args, gh=None, env=None):
    entorno = {**os.environ, "TAMIZ_VIGIA_PAUSA": "0", "TAMIZ_VIGIA_ESPERA": "0",
               "TAMIZ_VIGIA_GH": gh or "/no/existe/gh", **(env or {})}
    return subprocess.run([sys.executable, str(SCRIPT), "--raiz", str(raiz), *args],
                          capture_output=True, text=True, env=entorno, timeout=120)


def leer_vigia(raiz):
    return json.loads((raiz / "web" / "data" / "vigia.json").read_text(encoding="utf-8"))


def huellas_de(raiz):
    return json.loads((raiz / "catalogo" / "vigia-huellas.json").read_text(encoding="utf-8"))


def tipos_de(doc, id_):
    for f in doc["fichas"]:
        if f["id"] == id_:
            return [s["tipo"] for s in f["senales"]]
    return []


# --- Segnali sulle date e sulle schede ------------------------------------------------------------

class SegnaliDate(unittest.TestCase):
    def test_revision_vencida(self):
        self.assertIn("revision_vencida", tipos_de_ficha(ficha("a", revisar_antes_de="2026-10-14")))
        self.assertIn("revision_vencida", tipos_de_ficha(ficha("a", revisar_antes_de="2026-10-15")))
        self.assertNotIn("revision_vencida", tipos_de_ficha(ficha("a", revisar_antes_de="2026-10-16")))

    def test_plazo_pasado_solo_con_fechas(self):
        vencido = {"tipo": "fechas", "inicio": "2026-09-01", "fin": "2026-10-14"}
        self.assertIn("plazo_pasado", tipos_de_ficha(ficha("a", plazo=vencido)))
        vigente = {"tipo": "fechas", "inicio": "2026-09-01", "fin": "2026-10-15"}
        self.assertNotIn("plazo_pasado", tipos_de_ficha(ficha("a", plazo=vigente)))
        abierto = {"tipo": "abierto_todo_el_ano", "fin": "2026-10-01"}
        self.assertNotIn("plazo_pasado", tipos_de_ficha(ficha("a", plazo=abierto)))

    def test_nueva_edicion_mes_e_mese_prima(self):
        def con_mes(tipo, mes, hoy):
            return tipos_di(ficha("a", plazo={"tipo": tipo, "mes_habitual": mes, "fuente": BASE + "/x"}), hoy)
        self.assertIn("nueva_edicion_esperada", con_mes("convocatoria_anual", 10, HOY))
        self.assertIn("nueva_edicion_esperada", con_mes("cerrado", 11, HOY))  # ottobre è il mese prima di novembre
        self.assertNotIn("nueva_edicion_esperada", con_mes("convocatoria_anual", 12, HOY))
        self.assertNotIn("nueva_edicion_esperada", con_mes("abierto_todo_el_ano", 10, HOY))

    def test_nueva_edicion_gennaio_dopo_dicembre(self):
        def con_mes(mes, hoy):
            return tipos_di(ficha("a", plazo={"tipo": "convocatoria_anual", "mes_habitual": mes, "fuente": BASE + "/x"}), hoy)
        self.assertIn("nueva_edicion_esperada", con_mes(1, date(2026, 12, 10)))  # gennaio: il mese prima è dicembre
        self.assertIn("nueva_edicion_esperada", con_mes(1, date(2027, 1, 10)))
        self.assertNotIn("nueva_edicion_esperada", con_mes(12, date(2027, 1, 10)))


def tipos_de_ficha(f, hoy=HOY):
    return tipos_di(f, hoy)


def tipos_di(f, hoy):
    return [s["tipo"] for s in V.senales_de(f, hoy, [])]


# --- Somiglianza dei titoli e convocatorie nuove --------------------------------------------------

def conv(titulo, publicada="2026-10-15", url_bdns="https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/1",
         ambito="comunitat"):
    return {"titulo": titulo, "publicada": publicada, "url_bdns": url_bdns, "url_bases": None, "ambito": ambito}


class SomiglianzaConvocatorie(unittest.TestCase):
    NOMBRE = "Bono Alquiler Joven — Comunitat Valenciana"
    FICHA = ficha("bono", nombre=NOMBRE, ambito="ES-VC", leido_por_agente="2026-10-14")

    def nuevas(self, convocatorias, f=None):
        return [s for s in V.senales_convocatorias(f or self.FICHA, convocatorias)
                if s["tipo"] == "posible_convocatoria_nueva"]

    def test_parole_significative(self):
        self.assertEqual(V.palabras_significativas("Ayudas para el alquiler joven 2026 — Estatal"), {"alquiler", "joven"})
        self.assertEqual(V.palabras_significativas("Educación técnica 2027"), {"educacion", "tecnica"})

    def test_somiglianza_80_per_cento(self):
        self.assertEqual(len(self.nuevas([conv("Bono Alquiler Joven para 2026")])), 1)
        self.assertEqual(len(self.nuevas([conv("Bono Cultural Joven 2026")])), 0)  # due parole su tre
        self.assertEqual(len(self.nuevas([conv("Bono Hostelería 2026 Comunitat Valenciana")])), 0)

    def test_una_sola_parola_non_basta(self):
        f = ficha("vivienda", nombre="Ayuda vivienda — Estatal", ambito="ES")
        self.assertEqual(self.nuevas([conv("Ayuda para la vivienda 2026", ambito="estado")], f), [])

    def test_publicada_dopo_la_lettura(self):
        self.assertEqual(len(self.nuevas([conv("Bono Alquiler Joven 2026", publicada="2026-10-15")])), 1)
        self.assertEqual(len(self.nuevas([conv("Bono Alquiler Joven 2026", publicada="2026-10-14")])), 0)
        self.assertEqual(len(self.nuevas([conv("Bono Alquiler Joven 2026", publicada=None)])), 0)

    def test_senza_data_di_riferimento_nessun_filtro(self):
        f = ficha("bono", nombre=self.NOMBRE, ambito="ES-VC", leido_por_agente=None, verificado_el=None)
        self.assertEqual(len(self.nuevas([conv("Bono Alquiler Joven 2026", publicada="2020-01-01")], f)), 1)

    def test_stesso_codice_bdns_nessun_segnale(self):
        f = ficha("bono", nombre=self.NOMBRE, ambito="ES-VC", bdns="918684")
        ok = conv("Bono Alquiler Joven 2026", url_bdns="https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/918684")
        otra = conv("Bono Alquiler Joven 2026", url_bdns="https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/9186845")
        self.assertEqual(self.nuevas([ok], f), [])
        self.assertEqual(len(self.nuevas([otra], f)), 1)

    def test_ambito_municipale_diverso(self):
        self.assertEqual(self.nuevas([conv("Bono Alquiler Joven 2026", ambito="local")]), [])

    def test_scheda_comunale_riconosciuta_dall_ente(self):
        # le schede hanno ambito ISO (ES-VC): quella del Comune si riconosce dall'organismo
        f = ficha("vlc", nombre="Emprende y Concilia (Ajuntament de València)", ambito="ES-VC",
                  organismo="Ajuntament de València - Servicio de Emprendimiento")
        self.assertEqual(len(self.nuevas([conv("Ayudas Emprende y Concilia 2027", ambito="local")], f)), 1)
        self.assertEqual(self.nuevas([conv("Ayudas Emprende y Concilia 2027", ambito="comunitat")], f), [])

    def test_testo_fra_parentesi_ignorato(self):
        clave = V.palabras_significativas("Beca Manuela Solís (Conselleria de Educación) — 2026")
        self.assertIn("manuela", clave)
        self.assertNotIn("conselleria", clave)
        self.assertNotIn("educacion", clave)

    def test_al_massimo_tre(self):
        convocatorias = [conv(f"Bono Alquiler Joven 2026 numero {n}") for n in range(5)]
        self.assertEqual(len(self.nuevas(convocatorias)), 3)

    def test_detalle_e_url(self):
        s = self.nuevas([conv("Bono Alquiler Joven 2026")])[0]
        self.assertIn("15 de octubre de 2026", s["detalle"])
        self.assertEqual(s["url"], "https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/1")


# --- Impronte delle fonti -------------------------------------------------------------------------

class Impronte(unittest.TestCase):
    def test_html_ignora_script_style_noscript(self):
        a = V.huella(b"<html><script>x=1</script><p>Hola  mundo</p><style>p{}</style></html>", "text/html; charset=utf-8")
        b = V.huella(b"<html><script>x=2</script><p>Hola mundo</p><noscript>no</noscript><style>p{color:red}</style></html>",
                     "text/html")
        self.assertEqual(a, b)
        self.assertNotEqual(a, V.huella(b"<html><p>Hola otro</p></html>", "text/html"))

    def test_pdf_bytes_grezzi(self):
        import hashlib
        pdf = b"%PDF-1.4 contenido"
        self.assertEqual(V.huella(pdf, "application/octet-stream"), hashlib.sha256(pdf).hexdigest())

    def test_urls_solo_http_senza_doppioni(self):
        self.assertEqual(V.urls_de(ficha("a", fuente="https://a.es/x", url_oficial="https://a.es/x",
                                         plazo={"fuente": "ftp://no"})), ["https://a.es/x"])


class Sigillatura(unittest.TestCase):
    def test_flusso_sigillo_cambio_e_instabilita(self):
        RUTAS["/estable.html"] = (200, "text/html", html("Ayuda estable"))
        RUTAS["/cambia.html"] = (200, "text/html", html("Versión uno"))
        contador = {"n": 0}

        def dinamica():
            contador["n"] += 1
            return 200, "text/html", html(f"Visitas {contador['n']}")
        RUTAS["/dinamica.html"] = dinamica
        RUTAS["/doc.pdf"] = (200, "application/pdf", b"%PDF-1.4 uno")
        fichas = [ficha("estable", fuente=BASE + "/estable.html"),
                  ficha("cambia", fuente=BASE + "/cambia.html"),
                  ficha("dinamica", fuente=BASE + "/dinamica.html"),
                  ficha("doc", fuente=BASE + "/doc.pdf")]
        raiz = crear_raiz(fichas, convocatorias=[])
        r = ejecutar(raiz, "--sellar", "--hoy", "2026-10-15")
        self.assertEqual(r.returncode, 0, r.stderr)
        sellos = huellas_de(raiz)
        self.assertEqual(list(sellos), sorted(sellos))  # ordinato per URL
        self.assertFalse(sellos[BASE + "/estable.html"]["inestable"])
        self.assertTrue(sellos[BASE + "/dinamica.html"]["inestable"])
        self.assertEqual(sellos[BASE + "/estable.html"]["sellado_el"], "2026-10-15")

        r = ejecutar(raiz, "--hoy", "2026-10-15")
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = leer_vigia(raiz)
        self.assertEqual(doc["fichas"], [])  # nessun cambio, nessuna instabilità segnalata

        RUTAS["/cambia.html"] = (200, "text/html", html("Versión dos, con novedades"))
        RUTAS["/doc.pdf"] = (200, "application/pdf", b"%PDF-1.4 dos")
        r = ejecutar(raiz, "--hoy", "2026-10-15")
        doc = leer_vigia(raiz)
        self.assertEqual(tipos_de(doc, "cambia"), ["fuente_cambiada"])
        self.assertEqual(tipos_de(doc, "doc"), ["fuente_cambiada"])
        self.assertEqual(tipos_de(doc, "dinamica"), [])
        self.assertEqual(tipos_de(doc, "estable"), [])
        self.assertEqual(doc["fichas"][0]["aviso_publico"], True)

    def test_cambio_passeggero_e_instabile_oggi(self):
        secuenza = []
        RUTAS["/secuenza.html"] = lambda: (200, "text/html", html(secuenza.pop(0)))
        raiz = crear_raiz([ficha("s", fuente=BASE + "/secuenza.html")], convocatorias=[])
        secuenza[:] = ["Ayuda original", "Ayuda original"]  # due letture per il sigillo
        r = ejecutar(raiz, "--sellar", "--hoy", "2026-10-15")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertFalse(huellas_de(raiz)[BASE + "/secuenza.html"]["inestable"])
        # oggi: prima lettura diversa, seconda uguale alla sigillata: cambio passeggero, nessun segnale
        secuenza[:] = ["Passeggero", "Ayuda original"]
        self.assertEqual(tipos_de(leer_vigia(ejecutar_e(raiz)), "s"), [])
        # oggi: due letture diverse fra loro: pagina instabile, nessun segnale
        secuenza[:] = ["Uno", "Dos"]
        self.assertEqual(tipos_de(leer_vigia(ejecutar_e(raiz)), "s"), [])

    def test_errore_di_rete_e_non_segnale(self):
        RUTAS["/rotta.html"] = (500, "text/plain", b"errore")
        RUTAS["/desaparecida.html"] = (200, "text/html", html("Hola"))
        raiz = crear_raiz([ficha("rotta", fuente=BASE + "/rotta.html"),
                           ficha("desaparecida", fuente=BASE + "/desaparecida.html")],
                          convocatorias=[],
                          huellas={BASE + "/rotta.html": {"sha256": "00", "sellado_el": "2026-10-01", "inestable": False},
                                   BASE + "/desaparecida.html": {"sha256": "00", "sellado_el": "2026-10-01", "inestable": False}})
        r = ejecutar(raiz, "--hoy", "2026-10-15")
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = leer_vigia(raiz)
        self.assertEqual(tipos_de(doc, "rotta"), [])
        self.assertEqual(tipos_de(doc, "desaparecida"), ["fuente_cambiada"])
        self.assertEqual(len(doc["no_comprobadas"]), 1)
        self.assertEqual(set(doc["no_comprobadas"][0]), {"id", "url", "error"})
        self.assertEqual(doc["no_comprobadas"][0]["id"], "rotta")
        self.assertFalse(any(f["id"] == "rotta" for f in doc["fichas"]))

    def test_senza_impronta_o_inestabile_non_si_scarica(self):
        raiz = crear_raiz([ficha("nueva", fuente=BASE + "/sin-huella-nueva.html")], convocatorias=[],
                          huellas={BASE + "/sin-huella-nueva.html": {"sha256": "x", "sellado_el": "2026-10-01", "inestable": True}})
        r = ejecutar(raiz, "--hoy", "2026-10-15")
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = leer_vigia(raiz)
        self.assertEqual(doc["fichas"], [])
        self.assertEqual(doc["no_comprobadas"], [])

    def test_sin_red_salta_i_controlli(self):
        RUTAS["/sin-red.html"] = (200, "text/html", html("Cambiata"))
        raiz = crear_raiz([ficha("sr", fuente=BASE + "/sin-red.html")], convocatorias=[],
                          huellas={BASE + "/sin-red.html": {"sha256": "00", "sellado_el": "2026-10-01", "inestable": False}})
        r = ejecutar(raiz, "--sin-red", "--hoy", "2026-10-15")
        doc = leer_vigia(raiz)
        self.assertEqual(r.returncode, 0)
        self.assertEqual(doc["fichas"], [])
        self.assertEqual(doc["no_comprobadas"], [])

    def test_sellar_conserva_la_impronta_se_la_fonte_non_si_legge(self):
        RUTAS["/a.html"] = (200, "text/html", html("A"))
        raiz = crear_raiz([ficha("a", fuente=BASE + "/a.html")], convocatorias=[],
                          huellas={BASE + "/a.html": {"sha256": "vecchia", "sellado_el": "2026-01-01", "inestable": False},
                                   BASE + "/vecchio.html": {"sha256": "altra", "sellado_el": "2026-01-01", "inestable": False}})
        RUTAS["/a.html"] = (500, "text/plain", b"giu")
        ejecutar(raiz, "--sellar", "--hoy", "2026-10-15")
        sellos = huellas_de(raiz)
        self.assertEqual(sellos[BASE + "/a.html"]["sha256"], "vecchia")
        self.assertNotIn(BASE + "/vecchio.html", sellos)  # senza scheda: la sigillatura completa la pulisce

    def test_sellar_solo_alcune_schede(self):
        RUTAS["/b.html"] = (200, "text/html", html("B"))
        RUTAS["/c.html"] = (200, "text/html", html("C"))
        raiz = crear_raiz([ficha("b", fuente=BASE + "/b.html"), ficha("c", fuente=BASE + "/c.html")], convocatorias=[],
                          huellas={BASE + "/c.html": {"sha256": "tenuta", "sellado_el": "2026-01-01", "inestable": False}})
        r = ejecutar(raiz, "--sellar", "--ids", "b", "--hoy", "2026-10-15")
        self.assertEqual(r.returncode, 0, r.stderr)
        sellos = huellas_de(raiz)
        self.assertIn(BASE + "/b.html", sellos)
        self.assertEqual(sellos[BASE + "/c.html"]["sha256"], "tenuta")


class FontiSenzaImpronta(unittest.TestCase):
    def test_elencate_con_il_motivo(self):
        fichas = [ficha("a", fuente="https://x.test/a", url_oficial=None, plazo={}),
                  ficha("b", fuente="https://x.test/b", url_oficial=None, plazo={})]
        huellas = {"https://x.test/b": {"sha256": "0" * 64, "sellado_el": "2026-10-15", "inestable": True}}
        senales, no_comprobadas, inestables, sin_huella = V.fuentes_cambiadas(
            fichas, huellas, leer=lambda url: self.fail("non deve leggere la rete"))
        self.assertEqual(senales, {})
        self.assertEqual(no_comprobadas, [])
        self.assertEqual(sin_huella, [{"id": "a", "url": "https://x.test/a", "motivo": "sin impronta"},
                                      {"id": "b", "url": "https://x.test/b", "motivo": "la página cambia sola"}])


def ejecutar_e(raiz):
    """Esegue lo script (senza sigillare) e restituisce la radice, per leggere vigia.json."""
    r = ejecutar(raiz, "--hoy", "2026-10-15")
    assert r.returncode == 0, r.stderr
    return raiz


# --- Formato di vigia.json e robustezza -----------------------------------------------------------

class FormatoEBuild(unittest.TestCase):
    def test_formato_del_documento(self):
        raiz = crear_raiz([ficha("b", revisar_antes_de="2026-10-01"),
                           ficha("a", plazo={"tipo": "fechas", "fin": "2026-10-01", "fuente": BASE + "/x"}),
                           ficha("z")],
                          convocatorias=[conv("Bono Alquiler Joven 2026")], )
        r = ejecutar(raiz, "--sin-red", "--hoy", "2026-10-15")
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = leer_vigia(raiz)
        self.assertEqual(set(doc), CLAVES_DOC)
        self.assertEqual(doc["generado_el"], "2026-10-15")
        self.assertEqual(doc["total_fichas"], 3)
        self.assertEqual(doc["con_senales"], len(doc["fichas"]))
        self.assertEqual([f["id"] for f in doc["fichas"]], ["a", "b"])  # solo con segnali, in ordine
        for f in doc["fichas"]:
            self.assertEqual(set(f), {"id", "nombre", "senales", "aviso_publico"})
            for s in f["senales"]:
                self.assertIn(s["tipo"], TIPOS)
                self.assertIsInstance(s["detalle"], str)
                self.assertTrue(set(s) <= {"tipo", "detalle", "url"})
        avisos = {f["id"]: f["aviso_publico"] for f in doc["fichas"]}
        self.assertEqual(avisos, {"a": False, "b": True})  # plazo_pasado non è un aviso pubblico

    def test_schede_rotte_e_indice_mancante_non_fanno_fallire(self):
        raiz = crear_raiz([ficha("ok", revisar_antes_de="2026-10-01")], convocatorias=None,
                          crudas={"rotta.json": "{non è json", "senza-id.json": json.dumps({"nombre": "x"})})
        r = ejecutar(raiz, "--sin-red", "--hoy", "2026-10-15")
        self.assertEqual(r.returncode, 0)
        self.assertIn("rotta.json", r.stderr)
        doc = leer_vigia(raiz)
        self.assertEqual(doc["total_fichas"], 1)
        self.assertEqual(tipos_de(doc, "ok"), ["revision_vencida"])

    def test_cartella_mancante_produce_un_file_valido(self):
        raiz = Path(tempfile.mkdtemp(prefix="vigia-vuota-"))
        r = ejecutar(raiz, "--hoy", "2026-10-15")
        self.assertEqual(r.returncode, 0, r.stderr)
        doc = leer_vigia(raiz)
        self.assertEqual(set(doc), CLAVES_DOC)
        self.assertEqual(doc["fichas"], [])

    def test_nomi_e_spazi_nel_nome_della_scheda(self):
        raiz = crear_raiz([ficha("x", nombre="Beca «rara» — Nacional", revisar_antes_de="2026-10-01")],
                          convocatorias=[])
        ejecutar(raiz, "--sin-red", "--hoy", "2026-10-15")
        self.assertEqual(leer_vigia(raiz)["fichas"][0]["nombre"], "Beca «rara» — Nacional")


# --- Issue su GitHub (gh finto) -------------------------------------------------------------------

GH_FINTO = '''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
entrada = sys.stdin.read() if "--body-file" in args else ""
with open(os.environ["FAKE_GH_LOG"], "a", encoding="utf-8") as f:
    f.write(json.dumps({"args": args, "entrada": entrada}, ensure_ascii=False) + "\\n")
if os.environ.get("FAKE_GH_FALLA") == "1":
    sys.stderr.write("HTTP 403: permesso negato\\n")
    sys.exit(1)
if args[:2] == ["issue", "list"]:
    sys.stdout.write(open(os.environ["FAKE_GH_LISTA"], encoding="utf-8").read())
sys.exit(0)
'''


class Issue(unittest.TestCase):
    def preparar(self, con_senales, lista, falla=False):
        raiz = crear_raiz([ficha("a", revisar_antes_de="2026-10-01"), ficha("b", revisar_antes_de="2026-10-01")],
                          convocatorias=[])
        if not con_senales:
            ejecutar(raiz, "--sin-red", "--hoy", "2026-10-15")
            doc = leer_vigia(raiz)
            doc["fichas"] = []
            doc["con_senales"] = 0
            (raiz / "web" / "data" / "vigia.json").write_text(json.dumps(doc), encoding="utf-8")
        else:
            ejecutar(raiz, "--sin-red", "--hoy", "2026-10-15")
        gh = raiz / "gh-finto.py"
        gh.write_text(GH_FINTO, encoding="utf-8")
        gh.chmod(0o755)
        lista_path = raiz / "lista.json"
        lista_path.write_text(json.dumps(lista), encoding="utf-8")
        log = raiz / "gh.log"
        env = {"FAKE_GH_LOG": str(log), "FAKE_GH_LISTA": str(lista_path), "FAKE_GH_FALLA": "1" if falla else "0"}
        r = ejecutar(raiz, "--issues", gh=str(gh), env=env)
        llamadas = [json.loads(l) for l in log.read_text(encoding="utf-8").splitlines()] if log.exists() else []
        return r, llamadas

    def test_crea_la_issue_se_manca(self):
        r, llamadas = self.preparar(True, [])
        self.assertEqual(r.returncode, 0, r.stderr)
        crea = [c for c in llamadas if c["args"][:2] == ["issue", "create"]]
        self.assertEqual(len(crea), 1)
        self.assertEqual(crea[0]["args"][crea[0]["args"].index("--title") + 1], "Vigía: fichas que revisar")
        self.assertIn("`a`", crea[0]["entrada"])
        self.assertIn("Abierta automáticamente por la vigía diaria de Tamiz.", crea[0]["entrada"])
        self.assertIn("<!-- vigia-ids: a,b -->", crea[0]["entrada"])

    def test_aggiorna_senza_commento_se_non_ci_sono_id_nuovi(self):
        cuerpo = "vecchio\n<!-- vigia-ids: a,b -->\n"
        lista = [{"number": 7, "title": "Vigía: fichas que revisar", "author": BOT, "body": cuerpo}]
        r, llamadas = self.preparar(True, lista)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue(any(c["args"][:3] == ["issue", "edit", "7"] for c in llamadas))
        self.assertFalse(any(c["args"][:2] == ["issue", "comment"] for c in llamadas))

    def test_commento_con_gli_id_nuovi(self):
        cuerpo = "vecchio\n<!-- vigia-ids: a -->\n"
        lista = [{"number": 7, "title": "Vigía: fichas que revisar", "author": BOT, "body": cuerpo}]
        r, llamadas = self.preparar(True, lista)
        com = [c for c in llamadas if c["args"][:2] == ["issue", "comment"]]
        self.assertEqual(len(com), 1)
        self.assertIn("`b`", com[0]["entrada"])
        self.assertNotIn("`a`", com[0]["entrada"])

    def test_chiude_se_non_ci_sono_schede(self):
        lista = [{"number": 7, "title": "Vigía: fichas que revisar", "author": BOT, "body": ""}]
        r, llamadas = self.preparar(False, lista)
        self.assertEqual(r.returncode, 0, r.stderr)
        cierra = [c for c in llamadas if c["args"][:3] == ["issue", "close", "7"]]
        self.assertEqual(len(cierra), 1)
        self.assertIn("--comment", cierra[0]["args"])

    def test_due_issue_aperte_ne_resta_una(self):
        lista = [{"number": 9, "title": "Vigía: fichas que revisar", "author": BOT, "body": ""},
                 {"number": 4, "title": "Vigía: fichas que revisar", "author": BOT, "body": ""},
                 {"number": 5, "title": "Otra cosa", "author": BOT, "body": ""}]
        r, llamadas = self.preparar(True, lista)
        cierra = [c["args"][2] for c in llamadas if c["args"][:2] == ["issue", "close"]]
        self.assertEqual(cierra, ["9"])  # resta la più vecchia (4), la 5 non è della vigía

    def test_issue_di_un_visitatore_con_lo_stesso_titolo_non_si_tocca(self):
        lista = [{"number": 3, "title": "Vigía: fichas que revisar", "author": {"is_bot": False, "login": "qualcuno"},
                  "body": "<!-- vigia-ids: a,b -->"}]
        r, llamadas = self.preparar(True, lista)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(len([c for c in llamadas if c["args"][:2] == ["issue", "create"]]), 1)
        self.assertFalse(any(len(c["args"]) > 2 and c["args"][2] == "3" for c in llamadas))

    def test_errori_di_gh_non_fanno_fallire(self):
        r, _ = self.preparar(True, [], falla=True)
        self.assertEqual(r.returncode, 0)
        self.assertIn("gh", r.stderr)
        self.assertNotIn("Traceback", r.stderr)

    def test_gh_mancante_non_fa_fallire(self):
        raiz = crear_raiz([ficha("a", revisar_antes_de="2026-10-01")], convocatorias=[])
        ejecutar(raiz, "--sin-red", "--hoy", "2026-10-15")
        r = ejecutar(raiz, "--issues", gh="/no/existe/gh")
        self.assertEqual(r.returncode, 0)

    def test_senza_vigia_json_non_chiama_gh(self):
        raiz = crear_raiz([], convocatorias=[])
        log = raiz / "gh.log"
        r = ejecutar(raiz, "--issues", gh=str(log), env={"FAKE_GH_LOG": str(log)})
        self.assertEqual(r.returncode, 0)
        self.assertFalse(log.exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
