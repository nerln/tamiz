#!/usr/bin/env python3
"""Genera web/data/indice.json: indice automatico delle convocatorie (BDNS e BOE) e delle
plazas previstas, al build. Non valuta niente: non dice se una convocatoria encaja con qualcuno.

Uso:
    python3 scripts/indice.py                  # BDNS + BOE (ayudas, becas, premios)
    python3 scripts/indice.py --salida RUTA    # scrive altrove (prove)

Fonti, divise in sezioni (ogni sezione si legge, o si conserva, per conto suo):
    bdns_estado    ricerca BDNS regiones=1, persone fisiche (tiposBeneficiario=1), si tiene nivel1 ESTADO
    bdns_valencia  ricerca BDNS regiones=54,55,56,57, si tengono AUTONOMICA, LOCAL e OTROS
    boe_ayudas, boe_becas, boe_premios   canali RSS del BOE (ISO-8859-1)
    Il dettaglio BDNS (una chiamata per convocatoria, fino a MAX_DETALLES) dà date, tipo di
    convocatoria e beneficiari.

Stato del plazo (estado_plazo), lo stesso calcolo di calcEstado() in web/js/indice.js:
    - con inicio e fin: abierta se inicio <= oggi <= fin, cerrada se fin < oggi, proxima se inicio > oggi;
    - con una sola data: cerrada se fin < oggi, proxima se inicio > oggi;
    - altrimenti (date mancanti o incomplete) decide il flag «abierto» della BDNS, solo se vero;
    - senza date e senza flag vero: segun_bases («Plazo según las bases»). Il flag falso senza date
      non dice «cerrada»: la BDNS lo mette falso a tutte le convocatorie senza date.

Destinatari:
    - BDNS: si scartano le concessioni dirette a un beneficiario nominato (tipoConvocatoria
      «Concesión directa - instrumental») e le convocatorie i cui beneficiari dichiarati sono solo enti
      o imprese (nessun «personas físicas que no desarrollan actividad económica»). «personas_fisicas»
      solo quando il dettaglio lo conferma; senza dettaglio «sin_verificar».
    - BOE (e i titoli BDNS): si scartano i titoli per enti (ayuntamientos, entidades, empresas,
      asociaciones, fundaciones, centros, corporaciones locales...) e le concessioni dirette o nominative;
      nel canale «ayudas» si tengono solo i titoli che parlano di persone (becas, premios, estudiantes,
      contratos predoctorales...). I destinatari BOE restano «sin_verificar».

Robustezza: se una sezione fallisce (anche a metà della paginazione), risponde vuota o con meno della
metà dei risultati della lettura precedente, si conservano le voci precedenti di quella sezione, con
il loro stato e la data della lettura. Un dettaglio nullo o rotto non fa crollare niente: la
convocatoria riprende la voce precedente se c'è, altrimenti resta con i dati della ricerca. Se nessuna
sezione è stata letta e il file esiste, il file non si tocca. Esce con 0 anche se le fonti sono in
errore; con 1 solo se non riesce a scrivere il file.

Regole: solo libreria standard; una richiesta alla volta con 1 s di pausa; timeout 20 s. Nessun dato
personale: le richieste contengono solo la data di inizio della finestra e i filtri di regione.
Variabili d'ambiente per le prove: TAMIZ_INDICE_BDNS, TAMIZ_INDICE_BOE, TAMIZ_INDICE_PAUSA.
"""

import argparse
import email.utils
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA_DEFECTO = RAIZ / "web" / "data" / "indice.json"
PREVISTAS = RAIZ / "catalogo" / "previstas.json"
TIMEOUT = 20
PAUSA = float(os.environ.get("TAMIZ_INDICE_PAUSA", "1.0"))
VENTANA_DIAS = 90
MAX_CONVOCATORIAS = 500
MAX_DETALLES = 600
PAGINA_TAMANO = 500
PAGINAS_MAX = 10
TITULO_MAX = 400
UA = "Tamiz-build/1.0 (https://nerln.github.io/tamiz/; generador de indice.json)"

PERSONAS_FISICAS = "personas fisicas que no desarrollan actividad economica"
# Beneficiari BDNS che sono enti o imprese (id 2, 3, 4 dell'elenco «beneficiarios»).
TIPOS_ENTIDAD = {
    "personas juridicas que no desarrollan actividad economica",
    "pyme y personas fisicas que desarrollan actividad economica",
    "gran empresa",
}

FUENTES = {
    "bdns": {
        "nombre": "BDNS",
        "url": "https://www.infosubvenciones.es/bdnstrans/GE/es/index",
        "atribucion": (
            "Fuente: Base de Datos Nacional de Subvenciones (infosubvenciones.es). "
            "Reutilización sujeta al aviso legal del portal."
        ),
        "defecto": "https://www.infosubvenciones.es/bdnstrans/api/",
    },
    "boe": {
        "nombre": "BOE",
        "url": "https://www.boe.es/",
        "atribucion": "Basado en datos de la Agencia Estatal Boletín Oficial del Estado.",
        "defecto": "https://www.boe.es/rss/canal.php?c=",
    },
}

SECCIONES = {
    "bdns_estado": "BDNS, Estado",
    "bdns_valencia": "BDNS, Comunitat Valenciana y entidades locales",
    "boe_ayudas": "BOE, canal de ayudas",
    "boe_becas": "BOE, canal de becas",
    "boe_premios": "BOE, canal de premios",
}

REGIONES_ESTADO = "1"
REGIONES_VALENCIA = "54,55,56,57"  # ES52 Comunidad Valenciana, Alicante, Castellón, Valencia

RE_CV = re.compile(
    r"\b(valenciana|valenciano|valencia(?! de (?:don juan|alcantara))|valència|alicante|alacant|"
    r"castellon|castello|generalitat|conselleria|ajuntament|elche|elx|gandia|torrevieja|benidorm|"
    r"sagunto|paterna|torrent)\b"
)
RE_LOCAL = re.compile(r"\b(ayuntamiento|ajuntament|diputacion|diputaci|concello|municipio|entidades locales)\b")
RE_ESTADO = re.compile(
    r"\b(ministerio|secretaria de estado|secretaria general|estatal|gobierno de espana|real decreto|"
    r"agencia estatal|csic|sepe|seguridad social|estado)\b"
)
RE_OTRA_CCAA = re.compile(
    r"\b(andalucia|aragon|asturias|baleares|illes balears|canarias|cantabria|castilla|catalunya|cataluna|"
    r"extremadura|galicia|madrid|murcia|navarra|euskadi|pais vasco|la rioja|ceuta|melilla|santiago de compostela)\b"
)
RE_BOE_CONVOCATORIA = re.compile(r"convoc")
RE_BOE_NO = re.compile(
    r"concede|concedid|designan|jurado|publican las subvenciones|resolucion definitiva|"
    r"relacion de|admitid|excluid|se modifica|modificacion|disponibilidad de credito|ampliacion de presupuesto|"
    r"correccion de errores"
)
# Concessioni dirette a un beneficiario nominato e nominative: non sono convocatorie a cui ci si possa
# presentare (testo normalizzato). Le convocatorie «en régimen de concesión directa» aperte a chiunque
# rispetti i requisiti (material escolar, emergencia social...) restano: hanno una convocatoria.
RE_NO_CONVOCATORIA = re.compile(
    r"subvenci\w* directa (?:a|al)\b|\bnom+inativ|\bconcede\b|\bconceden\b"
)
# Titoli il cui destinatario è un ente, non una persona (testo normalizzato).
RE_PARA_ENTIDADES = re.compile(
    r"\b(?:a|para|destinad[oa]s? a|dirigid[oa]s? a|convoca a) (?:los |las |la |el |determinad[oa]s )?"
    r"(?:ayuntamientos|entidades|empresas|pymes|asociaciones|fundaciones|centros|corporaciones locales|"
    r"universidades|organizaciones|federaciones|clubes|cooperativas|sociedades|comunidades de regantes|"
    r"instituciones|organismos|municipios|diputaciones|entes|locales comerciales|cofradias|confederaciones|"
    r"sindicatos|agrupaciones|plataformas|consorcios|mancomunidades|ong)\b|"
    r"promovid[oa]s por (?:las |los )?entidades|entidades de formacion|entidades locales|entidades sin animo|"
    r"corporaciones locales|organizaciones profesionales|plataformas? tecnologicas|"
    r"proyectos de generacion de conocimiento|doctorados industriales|torres quevedo|"
    r"centros?,? (?:servicios )?(?:y equipos )?de atencion temprana|fundacion estatal para la prevencion|"
    r"negociacion colectiva|formacion bim|metodologia bim|para (?:la )?contratacion de|"
    r"\bcontratacion de (?:personas|jovenes|desemplead|trabajador|personal)|"
    r"gastos de (?:funcionamiento|organizacion)|creacion de infraestructuras"
)
# Canale «ayudas» del BOE: si tengono solo i titoli che parlano di persone.
RE_PARA_PERSONAS = re.compile(
    r"\bbecas?\b|\bpremios?\b|predoctoral|posdoctoral|postdoctoral|juan de la cierva|ramon y cajal|"
    r"personal (?:tecnico|investigador)|\bpersonas\b|\bjovenes\b|estudiantes|alumn|deportistas|"
    r"investigador|estancias|ayudas? de viaje|ayuda al estudio|\bmujeres\b|familias|desemplead|artistas|"
    r"creador|escritor|traductor|dramaturgi|contratos? (?:pre|pos)"
)
RE_ORGANO_BOE = re.compile(
    r"((?:Ministerio|Secretar[ií]a de Estado|Generalitat|Conselleria|Ayuntamiento|Ajuntament|"
    r"Diputaci[oó]n|Universidad|Consejer[ií]a|Instituto|Agencia|Servicio P[uú]blico)[^,;]{0,120}?)"
    r"(?= por la que| por el que| de conformidad|, por| para | y se | \(|$)"
)


class Red:
    """Richieste HTTP in sequenza, con almeno PAUSA secondi fra l'inizio di una e l'altra."""

    def __init__(self):
        self.ultima = None

    def _esperar(self):
        if self.ultima is not None:
            espera = PAUSA - (time.monotonic() - self.ultima)
            if espera > 0:
                time.sleep(espera)
        self.ultima = time.monotonic()

    def bytes(self, url):
        self._esperar()
        peticion = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        with urllib.request.urlopen(peticion, timeout=TIMEOUT) as respuesta:
            return respuesta.read()

    def json(self, url):
        return json.loads(self.bytes(url).decode("utf-8"))


# ---------------------------------------------------------------- testo e date

def normalizar(texto):
    """Minuscole e senza accenti, spazi compattati, per i filtri sul testo."""
    if not isinstance(texto, str):
        return ""
    sciolto = unicodedata.normalize("NFD", texto)
    return " ".join("".join(c for c in sciolto if unicodedata.category(c) != "Mn").lower().split())


def limpiar(texto, maximo=TITULO_MAX):
    if not isinstance(texto, str):
        return ""
    limpio = " ".join(html.unescape(texto).split())
    if len(limpio) <= maximo:
        return limpio
    corte = limpio[: maximo - 1]
    espacio = corte.rfind(" ")
    if espacio > maximo * 0.6:
        corte = corte[:espacio]
    return corte.rstrip(" ,;:") + "…"


def miles(n):
    """Numero con il punto delle migliaia sempre (es-ES scritto: 2.671, 27.232)."""
    return f"{int(n):,}".replace(",", ".")


def convocatorias(n):
    return f"{miles(n)} convocatoria" if n == 1 else f"{miles(n)} convocatorias"


def fecha_corta(iso):
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", iso or "")
    return f"{m.group(3)}/{m.group(2)}/{m.group(1)}" if m else ""


def url_segura(url):
    if isinstance(url, str) and url.strip().startswith(("https://", "http://")):
        return url.strip()
    return None


def fecha_iso(valor):
    """Accetta «AAAA-MM-DD» (con o senza ora) o «DD/MM/AAAA»; restituisce «AAAA-MM-DD» o None."""
    if not isinstance(valor, str):
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", valor.strip())
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", valor.strip())
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def fecha_de_rss(valor):
    try:
        return email.utils.parsedate_to_datetime(valor).date().isoformat()
    except (TypeError, ValueError, IndexError):
        return None


def ambito_de(texto_n):
    """Stato, comunitat o locale valenciano, letto dal testo. None se non rientra nell'ambito."""
    if RE_OTRA_CCAA.search(texto_n):
        return None
    if RE_CV.search(texto_n):
        return "local" if RE_LOCAL.search(texto_n) else "comunitat"
    if RE_ESTADO.search(texto_n):
        return "estado"
    return None


def excluida_por_titulo(titulo):
    """Concessioni dirette o nominative, e titoli il cui destinatario è un ente."""
    t = normalizar(titulo)
    return bool(RE_NO_CONVOCATORIA.search(t) or RE_PARA_ENTIDADES.search(t))


def estado_plazo(flag, inicio, fin, hoy):
    """Stato del plazo calcolato dalle date; il flag BDNS solo quando le date non bastano.

    Restituisce (estado, por): estado in abierta, proxima, cerrada, segun_bases;
    por in fechas, bdns, None (da dove viene lo stato).
    """
    if inicio and fin:
        if fin < hoy:
            return "cerrada", "fechas"
        if inicio > hoy:
            return "proxima", "fechas"
        return "abierta", "fechas"
    if fin and fin < hoy:
        return "cerrada", "fechas"
    if inicio and inicio > hoy:
        return "proxima", "fechas"
    if flag is True:
        return "abierta", "bdns"
    return "segun_bases", None


# ---------------------------------------------------------------- BDNS

def url_bdns(base, ruta, **params):
    return base.rstrip("/") + "/" + ruta + "?" + urllib.parse.urlencode(params, safe=",/")


def busqueda_bdns(red, base, regiones, desde):
    """Tutte le pagine di una ricerca BDNS per persone fisiche dalla data «desde».
    Un errore a qualunque pagina fa fallire la ricerca intera: niente letture a metà."""
    filas = []
    for pagina in range(PAGINAS_MAX):
        datos = red.json(url_bdns(
            base, "convocatorias/busqueda", vpd="GE", page=pagina, pageSize=PAGINA_TAMANO,
            order="fechaRecepcion", direccion="desc", regiones=regiones,
            tiposBeneficiario=1, fechaDesde=desde,
        ))
        if not isinstance(datos, dict) or not isinstance(datos.get("content"), list):
            raise ValueError(f"respuesta sin lista «content» en la página {pagina + 1}")
        contenido = datos["content"]
        filas.extend(f for f in contenido if isinstance(f, dict))
        total_paginas = datos.get("totalPages")
        if not contenido or not isinstance(total_paginas, int) or pagina + 1 >= total_paginas:
            break
    return filas


def detalle_bdns(red, base, codigo):
    """Il dettaglio di una convocatoria, o None se la risposta non è un oggetto (null, lista, rotto)."""
    try:
        detalle = red.json(url_bdns(base, "convocatorias", vpd="GE", numConv=codigo))
    except (OSError, ValueError, UnicodeDecodeError):
        return None
    return detalle if isinstance(detalle, dict) else None


def destinatarios_bdns(detalle):
    """«personas_fisicas» (la BDNS indica solo personas físicas), «personas_y_entidades» (personas
    físicas più altri beneficiari), «entidades» (da scartare) o «sin_verificar»."""
    tipos = detalle.get("tiposBeneficiarios")
    if not isinstance(tipos, list):
        return "sin_verificar"
    descr = {normalizar(t.get("descripcion")) for t in tipos if isinstance(t, dict) and t.get("descripcion")}
    if PERSONAS_FISICAS in descr:
        return "personas_fisicas" if descr == {PERSONAS_FISICAS} else "personas_y_entidades"
    if descr and descr <= TIPOS_ENTIDAD:
        return "entidades"
    return "sin_verificar"


def es_concesion_nominativa(detalle):
    """Concessione diretta a un beneficiario nominato («Concesión directa - instrumental»), o nominativa."""
    tipo = normalizar(detalle.get("tipoConvocatoria"))
    return "instrumental" in tipo or "nominativ" in tipo


PALABRAS_PLANTILLA = {"abierto", "abierta", "cerrado", "cerrada", "desde", "hasta", "el", "dia", "a", "las",
                      "de", "del", "en", "inicio", "fin", "plazo", "hora", "horas", "periodo", "entrega",
                      "solicitud", "solicitudes", "presentacion"}


def plantilla_vacia(texto):
    """Il modello vuoto che la BDNS lascia in alcuni campi: «abierto desde hasta», «cerrado el dia .».
    Non dice nulla: solo parole di modulo, senza cifre."""
    if not texto:
        return True
    n = normalizar(texto)
    if re.search(r"\d", n):
        return False
    return all(p in PALABRAS_PLANTILLA for p in re.findall(r"[a-z]+", n))


def texto_plazo(detalle):
    partes = []
    for clave, etiqueta in (("textInicio", "Inicio"), ("textFin", "Fin")):
        valor = limpiar(detalle.get(clave), 200)
        if valor and not plantilla_vacia(valor):
            partes.append(f"{etiqueta}: {valor}")
    return ". ".join(partes) or None


def nombre_organo(detalle, fila):
    organo = detalle.get("organo") if isinstance(detalle.get("organo"), dict) else {}
    for fuente in (organo, fila):
        for k in ("nivel3", "nivel2", "nivel1"):
            v = fuente.get(k)
            if isinstance(v, str) and v.strip():
                return v
    return ""


def convocatoria_bdns(fila, detalle, ambito, seccion, destinatarios):
    flag = detalle.get("abierto") if isinstance(detalle.get("abierto"), bool) else None
    codigo = str(detalle.get("codigoBDNS") or fila.get("numeroConvocatoria") or "")
    return {
        "titulo": limpiar(detalle.get("descripcion") or fila.get("descripcion")),
        "organo": limpiar(nombre_organo(detalle, fila)),
        "ambito": ambito,
        "estado": None,  # si calcola in construir() dalle date di oggi
        "estado_por": None,
        "abierta_bdns": flag,
        "inicio": fecha_iso(detalle.get("fechaInicioSolicitud")),
        "fin": fecha_iso(detalle.get("fechaFinSolicitud")),
        "plazo_texto": texto_plazo(detalle),
        "tipo_convocatoria": limpiar(detalle.get("tipoConvocatoria"), 80) or None,
        "destinatarios": destinatarios,
        "url_bdns": f"https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/{codigo}" if codigo else None,
        "url_bases": url_segura(detalle.get("urlBasesReguladoras")) or url_segura(detalle.get("sedeElectronica")),
        "fuente": "BDNS",
        "seccion": seccion,
        "publicada": fecha_iso(fila.get("fechaRecepcion")) or fecha_iso(detalle.get("fechaRecepcion")),
    }


def leer_bdns(red, base, desde, previas_por_url):
    """Legge le due ricerche BDNS e i dettagli.

    Restituisce {seccion: resultado}; resultado ha «items» (None se la ricerca è fallita),
    «candidatas», «motivo», «sin_detalle», «detalle_anterior», descartes.
    """
    resultados = {}
    candidatas = []
    for seccion, regiones, niveles, ambito_fijo in (
        ("bdns_estado", REGIONES_ESTADO, {"ESTADO"}, "estado"),
        ("bdns_valencia", REGIONES_VALENCIA, {"AUTONOMICA", "LOCAL", "OTROS"}, None),
    ):
        res = {"items": None, "candidatas": 0, "motivo": None, "sin_detalle": 0, "detalle_anterior": 0,
               "fallos_detalle": 0, "entidades": 0, "nominativas": 0, "por_titulo": 0, "sobre_limite": 0}
        resultados[seccion] = res
        try:
            filas = busqueda_bdns(red, base, regiones, desde)
        except (OSError, ValueError, UnicodeDecodeError) as e:
            res["motivo"] = f"búsqueda fallida ({type(e).__name__}: {str(e)[:120]})"
            continue
        vistas = set()
        for fila in filas:
            nivel = normalizar(fila.get("nivel1") or "").upper()
            codigo = str(fila.get("numeroConvocatoria") or "")
            if nivel not in niveles or not codigo or codigo in vistas:
                continue
            vistas.add(codigo)
            ambito = ambito_fijo or ("local" if nivel == "LOCAL" else "comunitat")
            candidatas.append((fila, ambito, seccion))
        res["candidatas"] = len(vistas)
        res["items"] = []

    candidatas.sort(key=lambda t: t[0].get("fechaRecepcion") or "", reverse=True)
    for indice, (fila, ambito, seccion) in enumerate(candidatas):
        res = resultados[seccion]
        codigo = str(fila["numeroConvocatoria"])
        url = f"https://www.infosubvenciones.es/bdnstrans/GE/es/convocatoria/{codigo}"
        detalle = None
        if indice < MAX_DETALLES:
            detalle = detalle_bdns(red, base, codigo)
            if detalle is None:
                res["fallos_detalle"] += 1
        else:
            res["sobre_limite"] += 1
        if detalle is None:
            anterior = previas_por_url.get(url)
            if anterior is not None:
                # Senza dettaglio oggi: si riprende la voce della lettura precedente, con i filtri di oggi.
                if excluida_por_titulo(anterior.get("titulo")):
                    res["por_titulo"] += 1
                    continue
                res["detalle_anterior"] += 1
                res["items"].append(dict(anterior, seccion=seccion))
                continue
            res["sin_detalle"] += 1
            item = convocatoria_bdns(fila, {}, ambito, seccion, "sin_verificar")
        else:
            if es_concesion_nominativa(detalle):
                res["nominativas"] += 1
                continue
            destinatarios = destinatarios_bdns(detalle)
            if destinatarios == "entidades":
                res["entidades"] += 1
                continue
            item = convocatoria_bdns(fila, detalle, ambito, seccion, destinatarios)
        if not item["titulo"]:
            continue
        if excluida_por_titulo(item["titulo"]):
            res["por_titulo"] += 1
            continue
        res["items"].append(item)

    for res in resultados.values():
        intentos = res["candidatas"] - res["sobre_limite"]
        if res["items"] is not None and intentos and res["fallos_detalle"] * 2 > intentos:
            # Più della metà dei dettagli non è arrivata: la lettura è rotta, non si usa.
            res["motivo"] = (f"lectura interrumpida: {miles(res['fallos_detalle'])} de {miles(intentos)} "
                             f"detalles sin respuesta")
            res["items"] = None
    return resultados


# ---------------------------------------------------------------- BOE

def leer_canal_boe(red, base, canal, hoy):
    """Un canale RSS del BOE. Restituisce (items, candidatas). Gli errori escono."""
    desde = (hoy - timedelta(days=VENTANA_DIAS)).isoformat()
    raw = red.bytes(base.rstrip("=") + "=" + canal)
    raiz = ET.fromstring(raw)  # ET rispetta la codifica dichiarata nel prologo (ISO-8859-1)
    if raiz.find("channel") is None and raiz.tag != "channel":
        raise ValueError("el canal no es RSS")
    salida = []
    vistos = set()
    candidatas = 0
    for item in raiz.iter("item"):
        candidatas += 1
        titulo = limpiar(item.findtext("title") or "")
        enlace = url_segura(item.findtext("link"))
        publicada = fecha_de_rss(item.findtext("pubDate") or "")
        if not titulo or not enlace or not publicada:
            continue
        titulo_n = normalizar(titulo)
        if not RE_BOE_CONVOCATORIA.search(titulo_n) or RE_BOE_NO.search(titulo_n):
            continue
        if excluida_por_titulo(titulo):
            continue
        if canal == "ayudas" and not RE_PARA_PERSONAS.search(titulo_n):
            continue
        if publicada < desde or enlace in vistos:
            continue
        ambito = ambito_de(titulo_n)
        if ambito is None:
            continue
        vistos.add(enlace)
        organo_m = RE_ORGANO_BOE.search(titulo)
        salida.append({
            "titulo": titulo,
            "organo": limpiar(organo_m.group(1)) if organo_m else "Boletín Oficial del Estado",
            "ambito": ambito,
            "estado": None,
            "estado_por": None,
            "abierta_bdns": None,
            "inicio": None,
            "fin": None,
            "plazo_texto": None,
            "tipo_convocatoria": None,
            "destinatarios": "sin_verificar",
            "url_bdns": None,
            "url_bases": enlace,
            "fuente": "BOE",
            "seccion": f"boe_{canal}",
            "publicada": publicada,
        })
    return salida, candidatas


# ---------------------------------------------------------------- previstas

def cargar_previstas(ruta):
    """Il file curato a mano: solo le voci con titolo, ambito valido e fonte."""
    try:
        datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    if not isinstance(datos, list):
        return []
    buone = []
    for p in datos:
        if not isinstance(p, dict) or not p.get("titulo") or p.get("ambito") not in {"estado", "comunitat", "local"}:
            continue
        fuente = p.get("fuente") if isinstance(p.get("fuente"), dict) else {}
        if not url_segura(fuente.get("url")):
            continue
        buone.append(p)
    return buone


# ---------------------------------------------------------------- lettura precedente

def leer_anterior(ruta):
    try:
        datos = json.loads(Path(ruta).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return datos if isinstance(datos, dict) else None


def seccion_de(c):
    """La sezione di una voce; per i file vecchi (senza «seccion») si deduce."""
    s = c.get("seccion")
    if s in SECCIONES:
        return s
    if c.get("fuente") == "BDNS":
        return "bdns_estado" if c.get("ambito") == "estado" else "bdns_valencia"
    if c.get("fuente") == "BOE":
        t = normalizar(c.get("titulo"))
        return "boe_becas" if re.search(r"\bbecas?\b", t) else "boe_premios" if re.search(r"\bpremios?\b", t) else "boe_ayudas"
    return None


def secciones_anteriores(anterior, hoy):
    """{seccion: {"items": [...], "candidatas": n|None, "leida_el": fecha, "estado": ...}}"""
    previas = {s: {"items": [], "candidatas": None, "leida_el": None, "estado": None} for s in SECCIONES}
    if not isinstance(anterior, dict):
        return previas
    desde = (hoy - timedelta(days=VENTANA_DIAS)).isoformat()
    generado = fecha_iso(anterior.get("generado_el")) if isinstance(anterior.get("generado_el"), str) else None
    for c in anterior.get("convocatorias") or []:
        if not isinstance(c, dict) or not isinstance(c.get("titulo"), str):
            continue
        s = seccion_de(c)
        if s and (c.get("publicada") or "") >= desde:
            previas[s]["items"].append(c)
    for f in anterior.get("fuentes") or []:
        for sec in (f.get("secciones") or []) if isinstance(f, dict) else []:
            if isinstance(sec, dict) and sec.get("id") in previas:
                p = previas[sec["id"]]
                p["candidatas"] = sec.get("candidatas") if isinstance(sec.get("candidatas"), int) else None
                p["leida_el"] = sec.get("leida_el") if isinstance(sec.get("leida_el"), str) else None
                p["estado"] = sec.get("estado")
    for p in previas.values():
        p["leida_el"] = p["leida_el"] or generado
    return previas


def normalizar_anterior(c):
    """Una voce conservata da un file vecchio: campi del formato nuovo e filtri di oggi."""
    c = dict(c)
    flag = c.get("abierta_bdns", c.get("abierta"))
    c.pop("abierta", None)
    c.pop("en_plazo", None)
    c["abierta_bdns"] = flag if isinstance(flag, bool) and c.get("fuente") == "BDNS" else None
    if c.get("destinatarios") not in {"personas_fisicas", "personas_y_entidades", "sin_verificar"}:
        c["destinatarios"] = "sin_verificar"
    # Il «personas_fisicas» dei file vecchi valeva anche per le convocatorie con altri beneficiari accanto alle
    # persone fisiche: da quel file non si sa quali siano. Si declassa a «sin_verificar» finché un dettaglio BDNS
    # di oggi non lo conferma (le letture di oggi non passano da qui).
    if c["destinatarios"] == "personas_fisicas":
        c["destinatarios"] = "sin_verificar"
    for k in ("plazo_texto", "tipo_convocatoria", "estado_por"):
        c.setdefault(k, None)
    c["seccion"] = seccion_de(c)
    return c


# ---------------------------------------------------------------- build

LECTURA_FALLIDA = "no se pudo leer la fuente hoy"


def decidir(seccion, nuevas, candidatas, motivo, previa, hoy_iso):
    """Le voci di una sezione e la sua riga in «fuentes»: le nuove, o quelle della lettura precedente
    se la lettura di oggi è fallita, vuota o sospetta (meno della metà dei risultati di prima)."""
    previas = [normalizar_anterior(c) for c in previa["items"]]
    previas = [c for c in previas if not excluida_por_titulo(c.get("titulo"))]
    base_prev = previa["candidatas"] if previa["candidatas"] is not None else len(previa["items"])
    if nuevas is not None and base_prev and candidatas * 2 < base_prev:
        motivo = (f"{miles(candidatas)} resultados frente a {miles(base_prev)} de la lectura anterior"
                  if candidatas else "respuesta vacía")
        nuevas = None
    fila = {"id": seccion, "nombre": SECCIONES[seccion]}
    if nuevas is not None:
        fila.update(estado="ok", n=len(nuevas), candidatas=candidatas, leida_el=hoy_iso)
        return nuevas, fila
    leida = previa["leida_el"]
    # Il motivo tecnico (HTTP, lettura interrotta, numeri) resta nel JSON, in «detalle_tecnico»;
    # quello che vede la persona è una frase semplice.
    fila.update(
        estado="anterior" if previas else "error",
        n=len(previas),
        candidatas=previa["candidatas"],
        leida_el=leida,
        motivo=(f"{LECTURA_FALLIDA}; se mantienen {convocatorias(len(previas))} de la lectura del {fecha_corta(leida)}"
                if previas and leida else
                f"{LECTURA_FALLIDA}; se mantienen {convocatorias(len(previas))} de la lectura anterior"
                if previas else f"{LECTURA_FALLIDA}; no hay datos anteriores de esta sección"),
        detalle_tecnico=motivo or "sin detalle",
    )
    return previas, fila


def resumen_fuente(nombre, filas, extras):
    """Lo stato di una fonte dalle sue sezioni; «motivo» dice cosa manca."""
    datos = FUENTES[nombre]
    estados = [f["estado"] for f in filas]
    faltan = [f"{f['nombre']}: {f['motivo']}" for f in filas if f["estado"] != "ok"]
    tecnicos = [f"{f['nombre']}: {f['detalle_tecnico']}" for f in filas if f.get("detalle_tecnico")]
    if all(e == "ok" for e in estados) and not extras:
        estado = "ok"
    elif all(e == "error" for e in estados):
        estado = "error"
    else:
        estado = "parcial"
    fuente = {"nombre": datos["nombre"], "url": datos["url"], "atribucion": datos["atribucion"],
              "estado": estado, "n": sum(f["n"] for f in filas), "secciones": filas}
    if faltan or extras:
        fuente["motivo"] = "; ".join(faltan + extras)
    if tecnicos:
        fuente["detalle_tecnico"] = "; ".join(tecnicos)
    return fuente


def construir(anterior, hoy=None):
    """Restituisce (documento, lette): lette è il numero di sezioni lette con successo oggi."""
    red = Red()
    hoy = hoy or date.today()
    hoy_iso = hoy.isoformat()
    bdns_base = os.environ.get("TAMIZ_INDICE_BDNS", FUENTES["bdns"]["defecto"])
    boe_base = os.environ.get("TAMIZ_INDICE_BOE", FUENTES["boe"]["defecto"])
    previas = secciones_anteriores(anterior, hoy)
    previas_por_url = {
        c["url_bdns"]: normalizar_anterior(c)
        for s in ("bdns_estado", "bdns_valencia") for c in previas[s]["items"] if c.get("url_bdns")
    }

    todas = []
    fuentes = []
    lette = 0

    # BDNS
    desde = (hoy - timedelta(days=VENTANA_DIAS)).strftime("%d/%m/%Y")
    leidos = leer_bdns(red, bdns_base, desde, previas_por_url)
    filas = []
    sin_detalle = detalle_anterior = entidades = nominativas = por_titulo = 0
    for seccion in ("bdns_estado", "bdns_valencia"):
        r = leidos[seccion]
        items, fila = decidir(seccion, r["items"], r["candidatas"], r["motivo"], previas[seccion], hoy_iso)
        filas.append(fila)
        todas.extend(items)
        if fila["estado"] == "ok":
            lette += 1
            sin_detalle += r["sin_detalle"]
            detalle_anterior += r["detalle_anterior"]
            entidades += r["entidades"]
            nominativas += r["nominativas"]
            por_titulo += r["por_titulo"]
    extras = []
    if sin_detalle:
        extras.append(f"{convocatorias(sin_detalle)} sin detalle (sin fechas ni destinatarios verificados)")
    if detalle_anterior:
        extras.append(f"{convocatorias(detalle_anterior)} sin detalle hoy, con el de la lectura anterior")
    fuente = resumen_fuente("bdns", filas, extras)
    fuente["nota"] = (
        f"Descartadas: {miles(nominativas)} concesiones directas a un beneficiario nombrado, "
        f"{miles(entidades)} solo para entidades o empresas y {miles(por_titulo)} por el título "
        f"(destinatarios que no son personas)."
    )
    fuentes.append(fuente)

    # BOE
    filas = []
    for canal in ("ayudas", "becas", "premios"):
        seccion = f"boe_{canal}"
        try:
            items, candidatas = leer_canal_boe(red, boe_base, canal, hoy)
            motivo = None
        except (OSError, ValueError, ET.ParseError) as e:
            items, candidatas = None, 0
            motivo = f"canal no leído ({type(e).__name__}: {str(e)[:120]})"
        items, fila = decidir(seccion, items, candidatas, motivo, previas[seccion], hoy_iso)
        filas.append(fila)
        todas.extend(items)
        if fila["estado"] == "ok":
            lette += 1
    fuente = resumen_fuente("boe", filas, [])
    fuente["nota"] = "El canal no dice a quién va dirigida la convocatoria ni el plazo: mira las bases."
    fuentes.append(fuente)

    for f in fuentes:
        print(f"{f['nombre']}: {f['estado']}, {f['n']} voci" + (f" ({f['motivo']})" if f.get("motivo") else ""))

    unicas = {}
    for c in todas:
        clave = c.get("url_bdns") or c.get("url_bases") or c["titulo"]
        unicas.setdefault(clave, c)
    lista = list(unicas.values())
    for c in lista:
        # Lo stato si ricalcola sempre dalle date di oggi, anche per le voci conservate.
        flag = c["abierta_bdns"] if c.get("fuente") == "BDNS" else None
        c["estado"], c["estado_por"] = estado_plazo(flag, c.get("inicio"), c.get("fin"), hoy_iso)
    lista.sort(key=lambda c: (c.get("publicada") or "", c["titulo"]), reverse=True)
    # Il tetto taglia prima le chiuse più vecchie.
    lista.sort(key=lambda c: 1 if c["estado"] == "cerrada" else 0)

    doc = {
        "generado_el": datetime.now().astimezone().isoformat(timespec="seconds"),
        "ventana": {"desde": (hoy - timedelta(days=VENTANA_DIAS)).isoformat(), "hasta": hoy_iso},
        "fuentes": fuentes,
        "total_convocatorias": len(lista),
        "recortadas": max(0, len(lista) - MAX_CONVOCATORIAS),
        "convocatorias": lista[:MAX_CONVOCATORIAS],
        "previstas": cargar_previstas(PREVISTAS),
    }
    return doc, lette


def escribir(doc, salida):
    salida = Path(salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    temporal = salida.with_name(salida.name + ".tmp")
    temporal.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporal, salida)


def main():
    parser = argparse.ArgumentParser(description="Genera web/data/indice.json (convocatorias y plazas previstas).")
    parser.add_argument("--salida", default=str(SALIDA_DEFECTO), help="file da scrivere")
    args = parser.parse_args()
    try:
        doc, lette = construir(leer_anterior(args.salida))
    except Exception as e:  # un dato strano non deve far fallire il build: il file resta com'è
        print(f"Errore inatteso, {args.salida} non toccato: {type(e).__name__}: {e}", file=sys.stderr)
        return 0
    if lette == 0 and Path(args.salida).exists():
        # Nessuna sezione letta oggi: non si riscrive il file della build precedente.
        print(f"Nessuna fonte letta con successo: {args.salida} resta com'è.", file=sys.stderr)
        return 0
    try:
        escribir(doc, args.salida)
    except OSError as e:
        print(f"Errore nello scrivere {args.salida}: {e}", file=sys.stderr)
        return 1
    conteo = Counter(c.get("estado") for c in doc["convocatorias"])
    por_ambito = Counter(c.get("ambito") for c in doc["convocatorias"])
    dest = Counter(c.get("destinatarios") for c in doc["convocatorias"])
    print(f"Scritto {args.salida}: {len(doc['convocatorias'])} convocatorias de {doc['total_convocatorias']} "
          f"(recortadas {doc['recortadas']}); por ámbito: estado {por_ambito['estado']}, "
          f"comunitat {por_ambito['comunitat']}, local {por_ambito['local']}; "
          f"abiertas {conteo['abierta']}, próximas {conteo['proxima']}, cerradas {conteo['cerrada']}, "
          f"según las bases {conteo['segun_bases']}; personas físicas {dest['personas_fisicas']}, "
          f"sin verificar {dest['sin_verificar']}; {len(doc['previstas'])} plazas previstas; "
          f"fuentes: " + ", ".join(f"{f['nombre']} {f['estado']}" for f in doc["fuentes"]) + ".")
    return 0


if __name__ == "__main__":
    sys.exit(main())
