#!/usr/bin/env python3
"""Genera web/data/empleo.json: ofertas de empleo da fonti aperte, al build.

Uso:
    python3 scripts/empleo.py                  # Arbeitnow, Remotive, BOE (II.B)
    python3 scripts/empleo.py --eures          # aggiunge EURES (spento di default)
    python3 scripts/empleo.py --salida RUTA    # scrive altrove (prove)

Fonti:
    arbeitnow   job-board-api, 3 pagine, tiene solo remote=true o località in Spagna
    remotive    una sola richiesta (remote-jobs), categorie software/data/IA, Europa/Spagna;
                se la build precedente ha letto Remotive meno di 24 ore fa (fuentes[Remotive]
                .leido_el, la data della lettura e non quella della build), riusa quelle
                offerte senza richiedere di nuovo (Remotive: al massimo 4 richieste al giorno)
    boe         sumario del giorno e dei 2 giorni lavorativi precedenti, sezione 2B
    eures       solo con --eures: endpoint non documentato, filtro es52, poi ES521/2/3 qui

Regole: solo libreria standard; una richiesta alla volta con 1 s di pausa; timeout 20 s.
Se una fonte fallisce, lo script continua con le altre e lo scrive in «fuentes» con
estado "error" e il motivo. Le offerte già lette prima dell'errore restano nel file (n è
il loro numero). Esce con 0 anche se una o tutte le fonti sono in errore: il file viene
scritto comunque. Eccezione: se nessuna fonte è stata letta con successo in questa build
(il riuso di Remotive non conta) e il file precedente esiste, il file non viene toccato:
lo script stampa un messaggio ed esce con 0. Esce con 1 solo se non riesce a scrivere.

Per ogni offerta tiene solo titolo, azienda, luogo, data, link, fonte e categoria. La
descrizione della fonte si legge solo per classificare l'offerta e non si salva.
Variabili d'ambiente per le prove (URL di base): TAMIZ_EMPLEO_ARBEITNOW,
TAMIZ_EMPLEO_REMOTIVE, TAMIZ_EMPLEO_BOE, TAMIZ_EMPLEO_EURES.
"""

import argparse
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA_DEFECTO = RAIZ / "web" / "data" / "empleo.json"
TIMEOUT = 20
PAUSA = 1.0
MAX_OFERTAS = 150
ARBEITNOW_PAGINAS = 3
REMOTIVE_REUSO_HORAS = 24
TITULO_MAX_DEFECTO = 200
TITULO_MAX_BOE = 600  # i titoli BOE sono lunghi ma finiti: troncarli cambia il senso
UA = "Tamiz-build/1.0 (https://nerln.github.io/tamiz/; generador de empleo.json)"

CAT_INVESTIGACION = "investigacion_universidad"
CAT_REMOTO = "remoto_europa"
CAT_VALENCIA = "comunitat_valenciana"
CAT_PUBLICO = "empleo_publico"

# Testi di attribuzione: il sito li mostra così come sono.
FUENTES = {
    "arbeitnow": {
        "nombre": "Arbeitnow",
        "url": "https://www.arbeitnow.com/",
        "atribucion": "Ofertas de Arbeitnow (arbeitnow.com), con enlace de vuelta a la fuente.",
        "defecto": "https://www.arbeitnow.com/api/job-board-api",
    },
    "remotive": {
        "nombre": "Remotive",
        "url": "https://remotive.com/",
        "atribucion": "Ofertas de Remotive (remotive.com), con un retraso de 24 horas.",
        "defecto": "https://remotive.com/api/remote-jobs?limit=100",
    },
    "boe": {
        "nombre": "BOE",
        "url": "https://www.boe.es/",
        "atribucion": "Fuente de los datos: Agencia Estatal Boletín Oficial del Estado",
        "defecto": "https://www.boe.es/datosabiertos/api/boe/sumario/",
    },
    "eures": {
        "nombre": "EURES",
        "url": "https://eures.europa.eu/",
        "atribucion": "Fuente: EURES (European Labour Authority).",
        "defecto": "https://europa.eu/eures/api/jv-searchengine/public/jv-search/search",
    },
}

# Filtri sul testo, già senza accenti e in minuscolo (vedi normalizar).
RE_ESPANA = re.compile(
    r"\b(spain|espana|madrid|barcelona|valencia|sevilla|bilbao|malaga|alicante|"
    r"zaragoza|murcia|castellon|canarias|mallorca|palma)\b"
)
# «Valencia de Don Juan» (León) e «Valencia de Alcántara» (Cáceres) non sono la Comunitat
# Valenciana; «Castelló d'Empúries» e «Castello de Farfanya» (Catalogna, Aragona) neppure.
# «castello» da solo non basta: si accetta solo la forma della capitale.
RE_VALENCIA = re.compile(
    r"\b(valencia(?! de (?:don juan|alcantara))|valencian\w*|alicante|alacant|castellon"
    r"|castello de la plana|castello/castellon)\b"
)
RE_INVESTIGACION = re.compile(
    r"investigad|investigaci|research|universidad|universitat|university|csic|postdoc|"
    r"phd|doctorad|cientific|becari"
)
RE_REMOTO = re.compile(r"teletrabaj|telework|remot|a distancia|home ?office|work from home")
# Atti di procedura e correzioni (liste, composizione di tribunali, nomine e adjudicaciones
# già fatte, errori di un atto precedente, date di esame): non sono offerte, si escludono
# dalla II.B. Le frasi sono scelte per indicare un esito senza posti: «tribunal», «nombr» e
# «adjudic» da sole scartavano convocatorie vere (Tribunal Supremo, nombrando a un asesor).
RE_PROCEDIMIENTO = re.compile(
    r"admitid|excluid|relacion (definitiva|provisional)|lista (de|provisional|definitiv)|"
    r"calificacion|corrig|correccion de errores|"
    r"fecha, hora y lugar|celebracion del primer ejercicio|"
    r"nombramiento de tribunal|composicion del tribunal|\bse nombran?\b|adjudicacion de destinos"
)
REMOTIVE_CATEGORIAS = {"Software Development", "Data and Analytics", "Artificial Intelligence"}
EURES_PROVINCIAS = {"ES521": "Alicante", "ES522": "Castellón", "ES523": "Valencia"}


class Red:
    """Richieste HTTP in sequenza, con almeno PAUSA secondi fra l'inizio di una e l'altra."""

    def __init__(self):
        self.ultima = None

    def pedir(self, url, cuerpo=None):
        if self.ultima is not None:
            espera = PAUSA - (time.monotonic() - self.ultima)
            if espera > 0:
                time.sleep(espera)
        self.ultima = time.monotonic()
        cabeceras = {"User-Agent": UA, "Accept": "application/json"}
        datos = None
        metodo = "GET"
        if cuerpo is not None:
            datos = json.dumps(cuerpo).encode("utf-8")
            cabeceras["Content-Type"] = "application/json"
            metodo = "POST"
        peticion = urllib.request.Request(url, data=datos, headers=cabeceras, method=metodo)
        with urllib.request.urlopen(peticion, timeout=TIMEOUT) as respuesta:
            return json.loads(respuesta.read().decode("utf-8"))


def normalizar(texto):
    """Minuscole e senza accenti, per i filtri sul testo."""
    if not isinstance(texto, str):
        return ""
    sciolto = unicodedata.normalize("NFD", texto)
    return "".join(c for c in sciolto if unicodedata.category(c) != "Mn").lower()


def limpiar(texto, maximo=TITULO_MAX_DEFECTO):
    if not isinstance(texto, str):
        return ""
    limpio = " ".join(html.unescape(texto).split())
    return limpio if len(limpio) <= maximo else limpio[: maximo - 1] + "…"


def url_segura(url):
    if isinstance(url, str) and url.strip().startswith(("https://", "http://")):
        return url.strip()
    return None


def lista(valor):
    if isinstance(valor, list):
        return valor
    if isinstance(valor, dict):
        return [valor]
    return []


def texto_de(valor):
    """Il BOE dà alcuni campi come stringa e altri come {«texto»: ...}."""
    if isinstance(valor, dict):
        return valor.get("texto") or valor.get("valor") or ""
    return valor if isinstance(valor, str) else ""


def fecha_de_epoch(segundos):
    return datetime.fromtimestamp(segundos, tz=timezone.utc).date().isoformat()


def fecha_iso(valor):
    """Accetta «AAAA-MM-DD», «AAAA-MM-DDTHH:MM:SS» o None; restituisce «AAAA-MM-DD» o None."""
    if isinstance(valor, str) and re.match(r"^\d{4}-\d{2}-\d{2}", valor):
        return valor[:10]
    return None


def oferta(titulo, empresa, lugar, remoto, fecha, url, fuente, categoria, maximo_titulo=TITULO_MAX_DEFECTO):
    url_ok = url_segura(url)
    titulo_ok = limpiar(titulo, maximo_titulo)
    if not url_ok or not titulo_ok:
        return None
    return {
        "titulo": titulo_ok,
        "empresa": limpiar(empresa),
        "lugar": limpiar(lugar),
        "remoto": bool(remoto),
        "fecha": fecha_iso(fecha),
        "url": url_ok,
        "fuente": fuente,
        "categoria": categoria,
    }


def url_con_parametros(base, **params):
    separador = "&" if "?" in base else "?"
    return base + separador + "&".join(f"{k}={v}" for k, v in params.items())


def url_de(clave):
    return os.environ.get(f"TAMIZ_EMPLEO_{clave.upper()}", FUENTES[clave]["defecto"])


# Ogni funzione di fonte scrive le offerte nella lista «salida» man mano che le legge:
# se una richiesta successiva fallisce, quelle già lette restano (vedi ejecutar).

# ---------------------------------------------------------------- Arbeitnow

def ofertas_arbeitnow(red, salida):
    ofertas = salida
    for pagina in range(1, ARBEITNOW_PAGINAS + 1):
        datos = red.pedir(url_con_parametros(url_de("arbeitnow"), page=pagina))
        for j in datos["data"]:
            lugar = j.get("location") or ""
            es_remoto = j.get("remote") is True
            en_espana = bool(RE_ESPANA.search(normalizar(lugar)))
            if es_remoto:
                categoria = CAT_REMOTO
            elif en_espana and RE_VALENCIA.search(normalizar(lugar + " " + j.get("title", ""))):
                categoria = CAT_VALENCIA
            elif en_espana and RE_INVESTIGACION.search(normalizar(j.get("title", ""))):
                categoria = CAT_INVESTIGACION
            else:
                # Spagna ma non Valenciana né ricerca: nessuna categoria dell'elenco la copre.
                # Decisione aperta (vedi docs/EMPLEO.md): per ora si scartano.
                continue
            fecha = fecha_de_epoch(j["created_at"]) if isinstance(j.get("created_at"), int) else None
            item = oferta(
                j.get("title"), j.get("company_name"), lugar or "Remoto", es_remoto,
                fecha, j.get("url"), "arbeitnow", categoria,
            )
            if item:
                ofertas.append(item)
        if not (datos.get("links") or {}).get("next"):
            break


# ---------------------------------------------------------------- Remotive

def ofertas_remotive(red, salida):
    datos = red.pedir(url_de("remotive"))
    ofertas = salida
    for j in datos["jobs"]:
        if j.get("category") not in REMOTIVE_CATEGORIAS:
            continue
        ubicacion = j.get("candidate_required_location") or ""
        ubicacion_n = normalizar(ubicacion)
        if not ("worldwide" in ubicacion_n or "europe" in ubicacion_n or "spain" in ubicacion_n):
            continue
        item = oferta(
            j.get("title"), j.get("company_name"), f"Remoto ({ubicacion})", True,
            j.get("publication_date"), j.get("url"), "remotive", CAT_REMOTO,
        )
        if item:
            ofertas.append(item)


def remotive_reciente(anterior):
    """Riuso di Remotive: il sito dice al massimo 4 richieste al giorno. Se la build precedente
    ha letto Remotive con successo meno di 24 ore fa, se ne riprendono le offerte senza una
    richiesta nuova. La misura è la data della lettura (fuentes[Remotive].leido_el), non quella
    della build: il riuso copia la data vecchia e non la sposta in avanti. Un file senza
    leido_el (formato precedente) conta come «da rileggere». Restituisce (fonte, ofertas)
    oppure None."""
    if not isinstance(anterior, dict):
        return None
    nombre = FUENTES["remotive"]["nombre"]
    previa = next(
        (f for f in anterior.get("fuentes", []) if isinstance(f, dict) and f.get("nombre") == nombre),
        None,
    )
    if not previa or previa.get("estado") != "ok":
        return None
    try:
        leido = datetime.fromisoformat(previa["leido_el"])
        antiguedad = datetime.now().astimezone() - leido
    except (KeyError, TypeError, ValueError):
        return None
    if not (timedelta(0) <= antiguedad < timedelta(hours=REMOTIVE_REUSO_HORAS)):
        return None
    ofertas = [o for o in anterior.get("ofertas", []) if isinstance(o, dict) and o.get("fuente") == "remotive"]
    fuente = {
        "nombre": nombre,
        "url": FUENTES["remotive"]["url"],
        "atribucion": FUENTES["remotive"]["atribucion"],
        "estado": "ok",
        "n": len(ofertas),
        "leido_el": previa["leido_el"],
        "nota": "Ofertas leídas el " + leido.strftime("%d/%m a las %H:%M") + ".",
    }
    return fuente, ofertas


# ---------------------------------------------------------------- BOE

def dias_boe(hoy):
    """Oggi e i 2 giorni lavorativi (lunedì-venerdì) precedenti."""
    dias = [hoy]
    giorno = hoy
    while len(dias) < 3:
        giorno = giorno - timedelta(days=1)
        if giorno.weekday() < 5:
            dias.append(giorno)
    return dias


def ofertas_boe(red, hoy, salida):
    base = url_de("boe").rstrip("/") + "/"
    ofertas = salida
    trovati = 0
    for dia in dias_boe(hoy):
        try:
            datos = red.pedir(base + dia.strftime("%Y%m%d"))
        except urllib.error.HTTPError as e:
            if e.code == 404:  # nessun sumario quel giorno (festivo o domenica)
                continue
            raise
        trovati += 1
        for diario in lista(datos["data"]["sumario"].get("diario")):
            for seccion in lista(diario.get("seccion")):
                if seccion.get("codigo") != "2B":
                    continue
                for departamento in lista(seccion.get("departamento")):
                    organismo = departamento.get("nombre") or ""
                    for grupo in lista(departamento.get("epigrafe")) or [departamento]:
                        for item in lista(grupo.get("item")):
                            titulo = item.get("titulo") or ""
                            if RE_PROCEDIMIENTO.search(normalizar(titulo)):
                                continue
                            texto_n = normalizar(titulo + " " + organismo)
                            if RE_INVESTIGACION.search(texto_n):
                                categoria = CAT_INVESTIGACION
                            elif RE_VALENCIA.search(texto_n):
                                categoria = CAT_VALENCIA
                            else:
                                categoria = CAT_PUBLICO
                            lugar = "Comunitat Valenciana" if RE_VALENCIA.search(texto_n) else "España"
                            ofertas_item = oferta(
                                titulo, organismo, lugar, False, dia.isoformat(),
                                texto_de(item.get("url_html")), "boe", categoria,
                                maximo_titulo=TITULO_MAX_BOE,
                            )
                            if ofertas_item:
                                ofertas.append(ofertas_item)
    if trovati == 0:
        # Tre giorni tutti senza sumario: l'endpoint è cambiato, non un giorno di pausa.
        raise ValueError("nessun sumario trovato nei 3 giorni richiesti")


# ---------------------------------------------------------------- EURES (solo con --eures)

def ofertas_eures(red, salida):
    cuerpo = {
        "resultsPerPage": 50,
        "page": 1,
        "sortSearch": "MOST_RECENT",
        "keywords": [],
        "locationCodes": ["es52"],
        "publicationPeriod": "LAST_WEEK",
    }
    datos = red.pedir(url_de("eures"), cuerpo=cuerpo)
    ofertas = salida
    for j in datos["jvs"]:
        codigos = [c for c in lista((j.get("locationMap") or {}).get("ES")) if c in EURES_PROVINCIAS]
        if not codigos:
            continue
        # Il testo serve solo a classificare l'offerta: la descrizione non si salva.
        testo_n = normalizar(j.get("title", "") + " " + str(j.get("translations", {})))
        if RE_REMOTO.search(testo_n):
            categoria = CAT_REMOTO
        elif RE_INVESTIGACION.search(testo_n):
            categoria = CAT_INVESTIGACION
        else:
            categoria = CAT_VALENCIA
        empleador = j.get("employer")
        empresa = empleador.get("name", "") if isinstance(empleador, dict) else empleador
        fecha = None
        if isinstance(j.get("creationDate"), (int, float)):
            fecha = fecha_de_epoch(j["creationDate"] / 1000)
        item = oferta(
            j.get("title"), empresa, EURES_PROVINCIAS[codigos[0]], categoria == CAT_REMOTO,
            fecha, f"https://europa.eu/eures/portal/jv-se/jv-details/{j.get('id', '')}",
            "eures", categoria,
        )
        if item:
            ofertas.append(item)


# ---------------------------------------------------------------- build

def ejecutar(clave, funcion, *args):
    """Una fonte: se fallisce, conserva le offerte già lette e segna estado error con il motivo."""
    salida = []
    fuente = {
        "nombre": FUENTES[clave]["nombre"],
        "url": FUENTES[clave]["url"],
        "atribucion": FUENTES[clave]["atribucion"],
        "estado": "ok",
        "n": 0,
    }
    try:
        funcion(*args, salida)
    except Exception as e:  # una fonte che cade non ferma il build
        fuente["estado"] = "error"
        fuente["motivo"] = f"{type(e).__name__}: {str(e)[:160]}"
    fuente["n"] = len(salida)
    return fuente, salida


def leer_anterior(ruta):
    """La build precedente, se esiste ed è leggibile (serve al riuso di Remotive)."""
    try:
        return json.loads(Path(ruta).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def construir(eures, anterior=None):
    """Restituisce (documento, frescas): frescas è il numero di fonti lette con successo in
    questa build, senza contare il riuso di Remotive. Con frescas == 0 il chiamante non deve
    sovrascrivere un file precedente."""
    red = Red()
    hoy = datetime.now().date()
    fuentes = []
    todas = []
    frescas = 0

    def registrar(fuente, ofertas, fresca=True):
        nonlocal frescas
        fuentes.append(fuente)
        todas.extend(ofertas)
        if fresca and fuente["estado"] == "ok":
            frescas += 1
        extra = f" ({fuente['motivo']})" if fuente["estado"] == "error" else ""
        extra += f" [{fuente['nota']}]" if fuente.get("nota") else ""
        print(f"{fuente['nombre']}: {fuente['estado']}, {fuente['n']} ofertas{extra}")

    registrar(*ejecutar("arbeitnow", ofertas_arbeitnow, red))
    reciente = remotive_reciente(anterior)
    if reciente:
        registrar(*reciente, fresca=False)
    else:
        inicio = datetime.now().astimezone()
        fuente, ofertas = ejecutar("remotive", ofertas_remotive, red)
        if fuente["estado"] == "ok":
            fuente["leido_el"] = inicio.isoformat(timespec="seconds")
        registrar(fuente, ofertas)
    registrar(*ejecutar("boe", ofertas_boe, red, hoy))
    if eures:
        registrar(*ejecutar("eures", ofertas_eures, red))

    vistas = set()
    unicas = []
    for o in todas:
        if o["url"] not in vistas:
            vistas.add(o["url"])
            unicas.append(o)
    unicas.sort(key=lambda o: (o["fecha"] or "", o["titulo"]), reverse=True)

    doc = {
        "generado_el": datetime.now().astimezone().isoformat(timespec="seconds"),
        "fuentes": fuentes,
        "ofertas": unicas[:MAX_OFERTAS],
    }
    return doc, frescas


def escribir(doc, salida):
    salida = Path(salida)
    salida.parent.mkdir(parents=True, exist_ok=True)
    temporal = salida.with_name(salida.name + ".tmp")
    temporal.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporal, salida)


def main():
    parser = argparse.ArgumentParser(description="Genera web/data/empleo.json (fonti aperte, al build).")
    parser.add_argument("--eures", action="store_true", help="include EURES (spento di default)")
    parser.add_argument("--salida", default=str(SALIDA_DEFECTO), help="file da scrivere")
    args = parser.parse_args()
    try:
        doc, frescas = construir(args.eures, leer_anterior(args.salida))
        if frescas == 0 and Path(args.salida).exists():
            # Nessuna fonte letta: un file vuoto o di soli errori cancellerebbe le offerte buone.
            print(f"Nessuna fonte letta con successo in questa build: {args.salida} resta com'è.",
                  file=sys.stderr)
            return 0
        escribir(doc, args.salida)
    except OSError as e:
        print(f"Errore nello scrivere {args.salida}: {e}", file=sys.stderr)
        return 1
    print(f"Scritto {args.salida}: {len(doc['ofertas'])} ofertas, "
          f"{sum(1 for f in doc['fuentes'] if f['estado'] == 'ok')} fonti ok de {len(doc['fuentes'])}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
