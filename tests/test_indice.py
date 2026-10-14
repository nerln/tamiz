#!/usr/bin/env python3
"""Prove di scripts/indice.py contro un server BDNS e BOE finto (dati sintetici, nessun dato vero).

Uso:
    python3 tests/test_indice.py              # prova lo script del repository
    TAMIZ_INDICE_SCRIPT=altro/indice.py python3 tests/test_indice.py

Lo script gira come processo a sé, con TAMIZ_INDICE_BDNS e TAMIZ_INDICE_BOE che puntano al server
finto, e scrive in un file temporaneo. Solo libreria standard.
"""

import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.parse
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SCRIPT = Path(os.environ.get("TAMIZ_INDICE_SCRIPT", RAIZ / "scripts" / "indice.py"))
HOY = date.today()


def d(dias):
    return (HOY + timedelta(days=dias)).isoformat()


FALLO = "__500__"
ESCENA = {}


class Finto(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def responder(self, cuerpo, tipo="application/json"):
        if cuerpo == FALLO:
            self.send_response(500)
            self.end_headers()
            return
        datos = cuerpo if isinstance(cuerpo, bytes) else json.dumps(cuerpo).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.end_headers()
        self.wfile.write(datos)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = dict(urllib.parse.parse_qsl(url.query))
        if url.path.endswith("/convocatorias/busqueda"):
            paginas = ESCENA["busqueda"].get(q.get("regiones"), [{"content": [], "totalPages": 0}])
            pagina = int(q.get("page", 0))
            return self.responder(paginas[pagina] if pagina < len(paginas) else {"content": [], "totalPages": len(paginas)})
        if url.path.endswith("/convocatorias"):
            return self.responder(ESCENA["detalle"].get(q.get("numConv"), FALLO))
        if url.path.endswith("/boe"):
            return self.responder(ESCENA["boe"].get(q.get("c"), rss([])), "application/rss+xml")
        self.send_response(404)
        self.end_headers()


def rss(items):
    cuerpo = "".join(
        f"<item><title>{t}</title><link>https://www.boe.es/diario_boe/{i}</link>"
        f"<pubDate>{HOY.strftime('%a, %d %b %Y')} 08:00:00 +0200</pubDate></item>"
        for i, t in enumerate(items)
    )
    return f'<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>x</title>{cuerpo}</channel></rss>'.encode()


def fila(codigo, titulo, nivel1="ESTADO"):
    return {"numeroConvocatoria": codigo, "descripcion": titulo, "fechaRecepcion": d(-3),
            "nivel1": nivel1, "nivel2": "ORGANO DE PRUEBA", "nivel3": None}


PF = {"descripcion": "PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA"}
PJ = {"descripcion": "PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA"}
PYME = {"descripcion": "PYME Y PERSONAS FÍSICAS QUE DESARROLLAN ACTIVIDAD ECONÓMICA"}


def detalle(codigo, titulo, inicio=None, fin=None, abierto=False, tipos=(PF,),
            tipo="Concurrencia competitiva - canónica", **extra):
    base = {"codigoBDNS": codigo, "descripcion": titulo, "abierto": abierto,
            "fechaInicioSolicitud": inicio, "fechaFinSolicitud": fin,
            "tiposBeneficiarios": list(tipos) if tipos is not None else None,
            "tipoConvocatoria": tipo, "organo": {"nivel1": "ESTADO", "nivel2": "MINISTERIO DE PRUEBA"}}
    base.update(extra)
    return base


def pagina(filas, total=1):
    return {"content": filas, "totalPages": total}


class Base(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Finto)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.salida = Path(self.tmp.name) / "indice.json"
        ESCENA.clear()
        ESCENA.update({"busqueda": {}, "detalle": {}, "boe": {}})

    def tearDown(self):
        self.tmp.cleanup()

    def correr(self):
        env = dict(os.environ, TAMIZ_INDICE_BDNS=self.base + "/bdns/", TAMIZ_INDICE_BOE=self.base + "/boe?c=",
                   TAMIZ_INDICE_PAUSA="0")
        p = subprocess.run([sys.executable, str(SCRIPT), "--salida", str(self.salida)],
                           env=env, capture_output=True, text=True, timeout=300)
        self.salida_proceso = p
        return p

    def doc(self):
        return json.loads(self.salida.read_text(encoding="utf-8"))

    def por_titulo(self, doc=None):
        return {c["titulo"]: c for c in (doc or self.doc())["convocatorias"]}


class EstadoDesdeFechas(Base):
    """(1) lo stato si calcola dalle date; il flag solo se mancano; senza entrambi «según las bases»."""

    def test_estados(self):
        casos = {
            "101": ("Becas A, abiertas por fechas, flag falso", dict(inicio=d(-5), fin=d(10), abierto=False)),
            "102": ("Becas B, cerradas por fechas, flag verdadero", dict(inicio=d(-40), fin=d(-2), abierto=True)),
            "103": ("Becas C, sin fechas, flag verdadero", dict(abierto=True)),
            "104": ("Becas D, sin fechas ni flag", dict(abierto=False, textInicio="Desde el día siguiente",
                                                      textFin="Veinte días hábiles")),
            "105": ("Becas E, abren más adelante", dict(inicio=d(5), fin=d(30), abierto=False)),
        }
        ESCENA["busqueda"]["1"] = [pagina([fila(k, v[0]) for k, v in casos.items()])]
        ESCENA["detalle"].update({k: detalle(k, v[0], **v[1]) for k, v in casos.items()})
        p = self.correr()
        self.assertEqual(p.returncode, 0, p.stderr)
        t = self.por_titulo()
        self.assertEqual(t["Becas A, abiertas por fechas, flag falso"].get("estado"), "abierta")
        self.assertEqual(t["Becas B, cerradas por fechas, flag verdadero"].get("estado"), "cerrada")
        self.assertEqual(t["Becas C, sin fechas, flag verdadero"].get("estado"), "abierta")
        self.assertEqual(t["Becas D, sin fechas ni flag"].get("estado"), "segun_bases")
        self.assertIn("Veinte días hábiles", t["Becas D, sin fechas ni flag"].get("plazo_texto") or "")
        self.assertEqual(t["Becas E, abren más adelante"].get("estado"), "proxima")


class Destinatarios(Base):
    """(2) fuori le concessioni nominative, le convocatorie solo per enti o imprese, i titoli per enti."""

    def test_bdns(self):
        casos = {
            "201": ("Ayudas para el estudio de idiomas", dict()),
            "202": ("Subvención al Consejo de la Juventud para gastos", dict(tipo="Concesión directa - instrumental")),
            "203": ("Ayudas a la digitalización del comercio", dict(tipos=(PYME,))),
            "204": ("Ayudas para proyectos culturales", dict(tipos=(PJ, PYME))),
            "205": ("Ayudas para material escolar del alumnado", dict(tipos=None)),
            "206": ("Subvenciones a asociaciones vecinales del municipio", dict()),
            "207": ("Ayudas para gastos de transporte de personas con discapacidad",
                    dict(tipo="Concesión directa - canónica")),
        }
        ESCENA["busqueda"]["1"] = [pagina([fila(k, v[0]) for k, v in casos.items()])]
        ESCENA["detalle"].update({k: detalle(k, v[0], **v[1]) for k, v in casos.items()})
        p = self.correr()
        self.assertEqual(p.returncode, 0, p.stderr)
        t = self.por_titulo()
        self.assertEqual(t["Ayudas para el estudio de idiomas"].get("destinatarios"), "personas_fisicas")
        self.assertNotIn("Subvención al Consejo de la Juventud para gastos", t)
        self.assertNotIn("Ayudas a la digitalización del comercio", t)
        self.assertNotIn("Ayudas para proyectos culturales", t)
        self.assertEqual(t["Ayudas para material escolar del alumnado"].get("destinatarios"), "sin_verificar")
        self.assertNotIn("Subvenciones a asociaciones vecinales del municipio", t)
        self.assertIn("Ayudas para gastos de transporte de personas con discapacidad", t)

    def test_boe(self):
        ESCENA["boe"]["ayudas"] = rss([
            "Extracto de la Orden del Ministerio de Prueba por la que se convocan subvenciones a ayuntamientos para obras",
            "Extracto de la Resolución de la Agencia Estatal de Investigación por la que se aprueba la convocatoria de ayudas a Proyectos de Generación de Conocimiento",
            "Extracto de la Resolución del Ministerio de Prueba por la que se convocan ayudas a entidades sin ánimo de lucro",
            "Extracto de la Resolución de la Agencia Estatal de Investigación por la que se aprueba la convocatoria de ayudas para contratos predoctorales",
        ])
        ESCENA["boe"]["becas"] = rss([
            "Extracto de la Orden del Ministerio de Prueba por la que se convocan becas de formación práctica",
        ])
        ESCENA["boe"]["premios"] = rss([
            "Orden del Ministerio de Prueba por la que se convocan los premios a centros educativos",
            "Orden del Ministerio de Prueba por la que se convoca el Premio Nacional de Ensayo",
        ])
        p = self.correr()
        self.assertEqual(p.returncode, 0, p.stderr)
        t = self.por_titulo()
        titulos = " | ".join(t)
        self.assertNotIn("ayuntamientos", titulos)
        self.assertNotIn("Generación de Conocimiento", titulos)
        self.assertNotIn("entidades sin ánimo", titulos)
        self.assertNotIn("centros educativos", titulos)
        self.assertIn("contratos predoctorales", titulos)
        self.assertIn("becas de formación práctica", titulos)
        self.assertIn("Premio Nacional de Ensayo", titulos)
        for c in t.values():
            self.assertNotEqual(c.get("destinatarios"), "personas_fisicas", "il BOE non conferma i destinatari")


def anterior_legacy():
    """Un file della build precedente, nel formato del commit 897b0b3 (campo «abierta»)."""
    def v(titulo, ambito, fuente="BDNS", codigo=None, url=None):
        return {"titulo": titulo, "organo": "Organo", "ambito": ambito, "abierta": None, "inicio": None,
                "fin": None, "url_bdns": f"https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/{codigo}" if codigo else None,
                "url_bases": url, "fuente": fuente, "publicada": d(-10)}
    return {
        "generado_el": f"{d(-1)}T07:00:00+02:00",
        "fuentes": [],
        "convocatorias": [
            v("Becas previas Estado uno", "estado", codigo="901"),
            v("Becas previas Comunitat uno", "comunitat", codigo="911"),
            v("Becas previas Comunitat dos", "comunitat", codigo="912"),
            v("Becas previas Comunitat tres", "local", codigo="913"),
            v("Orden del Ministerio de Prueba por la que se convocan becas previas del BOE", "estado", "BOE",
              url="https://www.boe.es/diario_boe/previa-becas"),
        ],
        "previstas": [],
    }


class Robustez(Base):
    """(3) una sezione che fallisce a metà o risponde vuota non svuota il file; un dettaglio nullo non lo
    fa crollare."""

    def scenario_base(self):
        ESCENA["busqueda"]["1"] = [pagina([fila("301", "Becas nuevas Estado")])]
        ESCENA["detalle"]["301"] = detalle("301", "Becas nuevas Estado", inicio=d(-1), fin=d(20))
        ESCENA["boe"]["becas"] = rss(["Orden del Ministerio de Prueba por la que se convocan becas nuevas del BOE"])

    def test_detalle_nulo(self):
        self.scenario_base()
        ESCENA["busqueda"]["1"][0]["content"].append(fila("302", "Becas con detalle nulo"))
        ESCENA["detalle"]["302"] = None
        p = self.correr()
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertNotIn("Traceback", p.stderr)
        t = self.por_titulo()
        self.assertIn("Becas nuevas Estado", t)
        self.assertEqual(t["Becas con detalle nulo"].get("destinatarios"), "sin_verificar")

    def test_busqueda_falla_a_mitad(self):
        self.salida.write_text(json.dumps(anterior_legacy()), encoding="utf-8")
        self.scenario_base()
        ESCENA["busqueda"]["54,55,56,57"] = [
            pagina([fila("401", "Becas nuevas Comunitat", "AUTONOMICA")], total=2), FALLO]
        ESCENA["detalle"]["401"] = detalle("401", "Becas nuevas Comunitat", inicio=d(-1), fin=d(20))
        p = self.correr()
        self.assertEqual(p.returncode, 0, p.stderr)
        doc = self.doc()
        t = self.por_titulo(doc)
        for previa in ("Becas previas Comunitat uno", "Becas previas Comunitat dos", "Becas previas Comunitat tres"):
            self.assertIn(previa, t)
        self.assertNotIn("Becas nuevas Comunitat", t, "una lettura a metà non si usa")
        self.assertIn("Becas nuevas Estado", t)
        bdns = next(f for f in doc["fuentes"] if f["nombre"] == "BDNS")
        self.assertEqual(bdns["estado"], "parcial")
        sec = {s["id"]: s for s in bdns.get("secciones", [])}
        self.assertEqual(sec["bdns_valencia"]["estado"], "anterior")
        self.assertIn("Comunitat", bdns.get("motivo", ""))

    def test_busqueda_vacia(self):
        self.salida.write_text(json.dumps(anterior_legacy()), encoding="utf-8")
        self.scenario_base()
        ESCENA["busqueda"]["54,55,56,57"] = [pagina([], total=0)]
        p = self.correr()
        self.assertEqual(p.returncode, 0, p.stderr)
        t = self.por_titulo()
        self.assertIn("Becas previas Comunitat uno", t)
        self.assertIn("Becas nuevas Estado", t)

    def test_canal_boe_falla(self):
        self.salida.write_text(json.dumps(anterior_legacy()), encoding="utf-8")
        self.scenario_base()
        ESCENA["boe"]["becas"] = FALLO
        ESCENA["boe"]["premios"] = rss(["Orden del Ministerio de Prueba por la que se convoca el Premio Nacional nuevo"])
        p = self.correr()
        self.assertEqual(p.returncode, 0, p.stderr)
        doc = self.doc()
        t = self.por_titulo(doc)
        self.assertIn("Orden del Ministerio de Prueba por la que se convocan becas previas del BOE", t)
        self.assertIn("Orden del Ministerio de Prueba por la que se convoca el Premio Nacional nuevo", t)
        boe = next(f for f in doc["fuentes"] if f["nombre"] == "BOE")
        self.assertEqual(boe["estado"], "parcial")
        self.assertIn("becas", boe.get("motivo", ""))

    def test_todo_cae_archivo_intacto(self):
        self.salida.write_text(json.dumps(anterior_legacy()), encoding="utf-8")
        antes = self.salida.read_bytes()
        ESCENA["busqueda"]["1"] = [FALLO]
        ESCENA["busqueda"]["54,55,56,57"] = [FALLO]
        ESCENA["boe"].update({"ayudas": FALLO, "becas": FALLO, "premios": FALLO})
        p = self.correr()
        self.assertEqual(p.returncode, 0, p.stderr)
        self.assertEqual(self.salida.read_bytes(), antes)


class Parcial(Base):
    """(6) «lectura parcial» dice cosa manca."""

    def test_motivo(self):
        ESCENA["busqueda"]["1"] = [pagina([fila("501", "Becas con detalle roto"), fila("502", "Becas buenas")])]
        ESCENA["detalle"]["501"] = FALLO
        ESCENA["detalle"]["502"] = detalle("502", "Becas buenas", inicio=d(-1), fin=d(9))
        p = self.correr()
        self.assertEqual(p.returncode, 0, p.stderr)
        bdns = next(f for f in self.doc()["fuentes"] if f["nombre"] == "BDNS")
        self.assertEqual(bdns["estado"], "parcial")
        self.assertIn("1 convocatoria sin detalle", bdns.get("motivo", ""))


class Textos(unittest.TestCase):
    """Funzioni pure di scripts/indice.py: plazo vuoto, destinatari misti, motivo per la persona."""

    @classmethod
    def setUpClass(cls):
        import importlib.util
        spec = importlib.util.spec_from_file_location("indice_mod", SCRIPT)
        cls.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.mod)

    def test_plazo_modello_vuoto(self):
        m = self.mod
        self.assertTrue(m.plantilla_vacia("abierto desde hasta"))
        self.assertTrue(m.plantilla_vacia("cerrado el día ."))
        self.assertFalse(m.plantilla_vacia("abierto desde el 15 de octubre hasta el 30"))
        self.assertIsNone(m.texto_plazo({"textInicio": "abierto desde hasta", "textFin": "cerrado el día ."}))
        self.assertEqual(m.texto_plazo({"textInicio": "abierto desde hasta", "textFin": "30 días naturales"}),
                         "Fin: 30 días naturales")

    def test_destinatarios_solo_personas_o_miste(self):
        m = self.mod
        pf = {"descripcion": "PERSONAS FÍSICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA"}
        pj = {"descripcion": "PERSONAS JURÍDICAS QUE NO DESARROLLAN ACTIVIDAD ECONÓMICA"}
        self.assertEqual(m.destinatarios_bdns({"tiposBeneficiarios": [pf]}), "personas_fisicas")
        self.assertEqual(m.destinatarios_bdns({"tiposBeneficiarios": [pf, pj]}), "personas_y_entidades")
        self.assertEqual(m.destinatarios_bdns({"tiposBeneficiarios": [pj]}), "entidades")

    def test_file_vecchio_personas_fisicas_si_declassa(self):
        # Il file della lettura precedente (prima della regola nuova) non dice se ci sono altri beneficiari:
        # «personas_fisicas» diventa «sin_verificar»; «personas_y_entidades» resta.
        m = self.mod
        self.assertEqual(m.normalizar_anterior({"fuente": "BDNS", "destinatarios": "personas_fisicas"})["destinatarios"],
                         "sin_verificar")
        self.assertEqual(m.normalizar_anterior({"fuente": "BDNS", "destinatarios": "personas_y_entidades"})["destinatarios"],
                         "personas_y_entidades")
        self.assertEqual(m.normalizar_anterior({"fuente": "BDNS"})["destinatarios"], "sin_verificar")

    def test_motivo_per_la_persona(self):
        m = self.mod
        _, fila = m.decidir("bdns_estado", None, 3, "búsqueda fallida (HTTPError: 500)",
                            {"items": [], "candidatas": 0, "leida_el": None}, "2026-10-14")
        self.assertTrue(fila["motivo"].startswith(m.LECTURA_FALLIDA))
        self.assertNotIn("HTTPError", fila["motivo"])
        self.assertIn("HTTPError", fila["detalle_tecnico"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
