#!/usr/bin/env python3
"""Vigía: la sentinella quotidiana di Tamiz. Senza IA. Segnala le schede che potrebbero essere
cambiate e basta: non dice se una ayuda encaja con nessuno, non cambia plazos né estados, non
modifica le schede.

Uso:
    python3 scripts/vigia.py                       # legge le schede, l'indice e le impronte;
                                                   # scrive web/data/vigia.json (controlla le fonti in rete)
    python3 scripts/vigia.py --hoy AAAA-MM-GG      # la data di riferimento (per le prove; di default oggi)
    python3 scripts/vigia.py --sin-red             # salta i controlli di rete (fuente_cambiada)
    python3 scripts/vigia.py --sellar              # ricalcola le impronte di tutte le fonti e le scrive
    python3 scripts/vigia.py --sellar --ids a,b    # ricalcola solo le schede indicate
    python3 scripts/vigia.py --issues              # tiene una sola issue aperta con le schede da rivedere (gh)
    python3 scripts/vigia.py --raiz CARTELLA       # un'altra radice (prove): schede, indice e impronte lì

Segnali per scheda (lista "senales", ognuno {tipo, detalle, url facoltativo}):
    revision_vencida            revisar_antes_de <= oggi
    plazo_pasado                plazo.tipo «fechas» e plazo.fin < oggi
    nueva_edicion_esperada      plazo.tipo «convocatoria_anual» o «cerrado», mes_habitual uguale al mese di
                                oggi o al mese prima (gennaio ha come mese prima dicembre)
    posible_convocatoria_nueva  una convocatoria di web/data/indice.json, pubblicata dopo la data di riferimento
                                della scheda, dello stesso ámbito (una municipale non è una statale o regionale),
                                con un titolo che somiglia al nome della scheda: almeno l'80 % delle sue parole
                                significative e almeno 2 (vedi palabras_significativas e senales_convocatorias).
                                Mai la stessa convocatoria (stesso codice BDNS nell'url_bdns); al massimo 3 per scheda
    fuente_cambiada             una fonte (fuente, url_oficial, plazo.fuente) la cui impronta non coincide con
                                catalogo/vigia-huellas.json. Un cambio conta solo se due letture di oggi, a
                                pochi secondi di distanza, danno la stessa impronta diversa da quella sigillata.

Impronte: per un PDF (content-type o firma %PDF) i byte grezzi; per il resto il testo visibile normalizzato
(senza script, style e noscript, spazi compressi). Errore di rete o HTTP: la fonte va in «no_comprobadas»,
non è un segnale. Una fonte senza impronta o marcata «inestable» non si scarica e non dà segnali.

aviso_publico è vero se la scheda ha almeno un segnale fra posible_convocatoria_nueva, fuente_cambiada e
revision_vencida. Lo script non fa fallire il build: ogni errore imprevisto va su stderr e si esce con 0.

Solo libreria standard. Richieste con timeout di 20 s, massimo 5 MB per risposta, User-Agent di Tamiz.
Variabili d'ambiente per le prove: TAMIZ_VIGIA_PAUSA (pausa fra due fonti), TAMIZ_VIGIA_ESPERA (attesa fra
due letture della stessa fonte), TAMIZ_VIGIA_GH (il comando gh).
"""

import argparse
import codecs
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import date
from html.parser import HTMLParser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
TIMEOUT = 20
MAX_BYTES = 5 * 1024 * 1024
UA = "Tamiz-build/1.0 (https://nerln.github.io/tamiz/; vigía)"
PAUSA = float(os.environ.get("TAMIZ_VIGIA_PAUSA", "0.5"))
ESPERA = float(os.environ.get("TAMIZ_VIGIA_ESPERA", "3"))
GH = os.environ.get("TAMIZ_VIGIA_GH", "gh")
MAX_CONVOCATORIAS = 3
TIPOS_AVISO = {"posible_convocatoria_nueva", "fuente_cambiada", "revision_vencida"}
TITULO_ISSUE = "Vigía: fichas que revisar"
PIE_ISSUE = "Abierta automáticamente por la vigía diaria de Tamiz. Se cierra sola cuando no queda nada que revisar."
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]
# Parole vuote spagnole (senza accenti, come le confronta il codice). Sono escluse dal confronto dei titoli.
PALABRAS_VACIAS = {
    "para", "ayudas", "ayuda", "convocatoria", "convocatorias", "programa", "desde", "entre", "sobre",
    "contratos", "personas", "subvenciones", "anual", "hasta", "todo", "todos", "toda", "todas", "esta",
    "este", "estos", "estas", "otros", "otras", "cada", "como", "segun", "ademas", "tambien",
    # nomi di luogo generici: in quasi ogni titolo, da soli fanno falsi allarmi
    "comunitat", "valenciana", "valencia", "espana", "estatal",
}
# Somiglianza fra il nome di una scheda e il titolo di una convocatoria: quota minima di parole
# significative (numeratore/denominatore) e minimo assoluto. Più stretta del 60 % di partenza: con
# il 60 % due parole su tre davano falsi allarmi («Bono cultural joven» contro «Bono alquiler joven»).
QUOTA_SOMIGLIANZA = (4, 5)
MINIMO_SOMIGLIANZA = 2
OCULTAS = {"script", "style", "noscript"}


# --- Lettura dei file ---------------------------------------------------------------------------

def breve(texto, maximo=200):
    texto = " ".join(str(texto).split())
    return texto if len(texto) <= maximo else texto[: maximo - 1] + "…"


def fecha(valor):
    """AAAA-MM-GG (anche con l'ora in coda) come date; altrimenti None."""
    if not isinstance(valor, str):
        return None
    m = re.match(r"\s*(\d{4})-(\d{2})-(\d{2})", valor)
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def fecha_larga(d):
    return f"{d.day} de {MESES[d.month - 1]} de {d.year}"


def mes_de(valor):
    if isinstance(valor, str) and valor.strip().isdigit():
        valor = int(valor.strip())
    if isinstance(valor, bool) or not isinstance(valor, int):
        return None
    return valor if 1 <= valor <= 12 else None


def cargar_fichas(carpeta):
    fichas = []
    for ruta in sorted(carpeta.glob("*.json")):
        try:
            doc = json.loads(ruta.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            print(f"vigía: scheda saltata {ruta.name}: {type(e).__name__}", file=sys.stderr)
            continue
        if isinstance(doc, dict) and isinstance(doc.get("id"), str):
            fichas.append(doc)
        else:
            print(f"vigía: scheda saltata {ruta.name}: manca l'id", file=sys.stderr)
    return fichas


def cargar_convocatorias(ruta):
    """Le convocatorie di web/data/indice.json. Se il file manca o non si legge, niente segnali (lista vuota)."""
    try:
        doc = json.loads(ruta.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return []
    except (OSError, ValueError) as e:
        print(f"vigía: indice non letto ({type(e).__name__}): nessun segnale di convocatoria", file=sys.stderr)
        return []
    lista = doc.get("convocatorias") if isinstance(doc, dict) else None
    return [c for c in lista if isinstance(c, dict)] if isinstance(lista, list) else []


def leer_huellas(ruta):
    try:
        doc = json.loads(ruta.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as e:
        print(f"vigía: impronte non lette ({type(e).__name__}): nessun controllo delle fonti", file=sys.stderr)
        return {}
    return doc if isinstance(doc, dict) else {}


def escribir_json(ruta, doc):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    temporal = ruta.with_name(ruta.name + ".tmp")
    temporal.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporal, ruta)


# --- Somiglianza dei titoli ---------------------------------------------------------------------

def normalizar(texto):
    nfkd = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def palabras(texto):
    """Parole di sole lettere a–z (le cifre e la punteggiatura non contano)."""
    return re.findall(r"[a-z]+", normalizar(texto))


def palabras_significativas(nombre):
    """Parole del nome prima di « — », senza il testo fra parentesi, di almeno 4 lettere, fuori dalle parole vuote."""
    parte = re.sub(r"\([^)]*\)", " ", nombre.split("—", 1)[0])
    return {w for w in palabras(parte) if len(w) >= 4 and w not in PALABRAS_VACIAS}


def misma_convocatoria(ficha, conv):
    """La convocatoria è quella della scheda se l'url_bdns finisce con il codice BDNS della scheda."""
    codigo = ficha.get("bdns")
    if codigo is None or isinstance(codigo, bool):
        return False
    codigo = str(codigo).strip()
    url = conv.get("url_bdns")
    if not codigo or not isinstance(url, str):
        return False
    return re.search(r"(?:^|[^0-9A-Za-z])" + re.escape(codigo) + r"/?\s*$", url.strip()) is not None


def ficha_municipal(ficha):
    """Le schede hanno ambito ISO (EU, ES, ES-VC): una scheda è municipale se l'organismo è un ayuntamiento."""
    organismo = ficha.get("organismo") if isinstance(ficha.get("organismo"), str) else ""
    ambito = ficha.get("ambito") if isinstance(ficha.get("ambito"), str) else ""
    return ambito.strip().lower() == "local" or re.search(r"\b(ajuntament|ayuntamiento)\b", normalizar(organismo)) is not None


def mismo_ambito(ficha, conv):
    """Una convocatoria municipale non è la nuova edizione di una ayuda statale, regionale o europea, né viceversa."""
    a_conv = conv.get("ambito")
    if not isinstance(a_conv, str):
        return True
    return ficha_municipal(ficha) == (a_conv.strip().lower() == "local")


def referencia(ficha):
    """Data di riferimento della scheda: verificado_el, altrimenti leido_por_agente se è una data."""
    return fecha(ficha.get("verificado_el")) or fecha(ficha.get("leido_por_agente"))


def senales_convocatorias(ficha, convocatorias):
    nombre = ficha.get("nombre")
    if not isinstance(nombre, str) or not convocatorias:
        return []
    clave = palabras_significativas(nombre)
    if len(clave) < 2:
        return []  # con meno di due parole significative non c'è una somiglianza che valga
    ref = referencia(ficha)
    out = []
    for conv in convocatorias:
        titulo = conv.get("titulo")
        if not isinstance(titulo, str) or not titulo.strip():
            continue
        publicada = fecha(conv.get("publicada"))
        if ref is not None and (publicada is None or publicada <= ref):
            continue
        if misma_convocatoria(ficha, conv) or not mismo_ambito(ficha, conv):
            continue
        acierto = len(clave & set(palabras(titulo)))
        # almeno MINIMO_SOMIGLIANZA parole e almeno la quota (in numeri interi: 5 * acierto >= 4 * totale)
        num, den = QUOTA_SOMIGLIANZA
        if acierto < MINIMO_SOMIGLIANZA or acierto * den < len(clave) * num:
            continue
        url = next((u for u in (conv.get("url_bdns"), conv.get("url_bases"))
                    if isinstance(u, str) and u.strip()), None)
        cuando = f" publicada el {fecha_larga(publicada)}" if publicada else ""
        senal = {"tipo": "posible_convocatoria_nueva",
                 "detalle": f"Hay una convocatoria{cuando} que se parece a esta ficha: «{breve(titulo, 160)}»."}
        if url:
            senal["url"] = url.strip()
        out.append(senal)
        if len(out) >= MAX_CONVOCATORIAS:
            break
    return out


# --- Segnali sulle date e sulle schede ----------------------------------------------------------

def senales_de(ficha, hoy, convocatorias):
    out = []
    revision = fecha(ficha.get("revisar_antes_de"))
    if revision and revision <= hoy:
        out.append({"tipo": "revision_vencida",
                    "detalle": f"La fecha prevista para revisar esta ficha ya pasó ({fecha_larga(revision)})."})
    plazo = ficha.get("plazo") if isinstance(ficha.get("plazo"), dict) else {}
    tipo = plazo.get("tipo")
    fin = fecha(plazo.get("fin"))
    if tipo == "fechas" and fin and fin < hoy:
        out.append({"tipo": "plazo_pasado", "detalle": f"El plazo terminó el {fecha_larga(fin)}."})
    mes = mes_de(plazo.get("mes_habitual"))
    if tipo in ("convocatoria_anual", "cerrado") and mes:
        anterior = 12 if mes == 1 else mes - 1  # gennaio ha come mese prima dicembre
        if hoy.month in (mes, anterior):
            out.append({"tipo": "nueva_edicion_esperada",
                        "detalle": f"Esta ayuda suele convocarse en {MESES[mes - 1]}. Puede haber una edición nueva."})
    out.extend(senales_convocatorias(ficha, convocatorias))
    return out


def senales_seguras(ficha, hoy, convocatorias):
    try:
        return senales_de(ficha, hoy, convocatorias)
    except Exception as e:  # un dato strano non fa crollare le altre schede
        print(f"vigía: scheda {ficha.get('id')} saltata: {type(e).__name__}: {breve(e)}", file=sys.stderr)
        return []


# --- Fonti: impronte e controllo ----------------------------------------------------------------

class TextoVisible(HTMLParser):
    """Raccoglie il testo visibile: niente script, style e noscript."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.partes = []
        self.ocultas = 0

    def handle_starttag(self, tag, attrs):
        if tag in OCULTAS:
            self.ocultas += 1

    def handle_endtag(self, tag):
        if tag in OCULTAS and self.ocultas:
            self.ocultas -= 1

    def handle_data(self, data):
        if not self.ocultas:
            self.partes.append(data)


def huella(cuerpo, tipo):
    """sha256 dei byte grezzi per un PDF; per il resto del testo visibile con gli spazi compressi."""
    if "pdf" in tipo.lower() or cuerpo[:5] == b"%PDF-":
        return hashlib.sha256(cuerpo).hexdigest()
    charset = "utf-8"
    m = re.search(r"charset=([\w.:-]+)", tipo, re.I)
    if m:
        try:
            codecs.lookup(m.group(1))
            charset = m.group(1)
        except LookupError:
            pass
    visible = TextoVisible()
    visible.feed(cuerpo.decode(charset, errors="replace"))
    visible.close()
    texto = " ".join(" ".join(visible.partes).split())
    return hashlib.sha256(texto.encode("utf-8")).hexdigest()


def leer_url(url):
    """Scarica una fonte: (sha256, None), oppure (None, errore breve). Non solleva mai eccezioni."""
    try:
        seguro = urllib.parse.quote(url, safe="%/:?=&#@+,;!$'()*~[]")
        peticion = urllib.request.Request(seguro, headers={"User-Agent": UA, "Accept": "*/*"})
        with urllib.request.urlopen(peticion, timeout=TIMEOUT) as respuesta:
            tipo = respuesta.headers.get("Content-Type") or ""
            cuerpo = respuesta.read(MAX_BYTES + 1)
        if len(cuerpo) > MAX_BYTES:
            return None, "risposta oltre 5 MB"
        return huella(cuerpo, tipo), None
    except Exception as e:  # rete, HTTP, timeout: la fonte resta non comprovata
        return None, breve(f"{type(e).__name__}: {e}")


def estado_fuente(url, sello, leer):
    """«igual», «cambiada», «inestable» o «error». Un cambio vale solo se due letture di oggi coincidono."""
    sha, error = leer(url)
    if error:
        return "error", error
    if sha == sello:
        return "igual", None
    time.sleep(ESPERA)
    otra, error = leer(url)
    if error:
        return "error", error
    if otra == sello:
        return "igual", None  # cambio passeggero, tornato come prima
    if otra != sha:
        return "inestable", None  # la pagina cambia da sola: non si segnala
    return "cambiada", None


def urls_de(ficha):
    plazo = ficha.get("plazo") if isinstance(ficha.get("plazo"), dict) else {}
    out = []
    for u in (ficha.get("fuente"), ficha.get("url_oficial"), plazo.get("fuente")):
        if isinstance(u, str) and u.strip().lower().startswith(("http://", "https://")):
            if u.strip() not in out:
                out.append(u.strip())
    return out


def fuentes_cambiadas(fichas, huellas, leer=leer_url):
    """({id: [senales]}, [no_comprobadas], numero di fonti inestabili oggi, [sin_huella])."""
    senales, no_comprobadas, estados, inestables = {}, [], {}, 0
    sin_huella = []
    for ficha in fichas:
        for url in urls_de(ficha):
            sello = huellas.get(url)
            if isinstance(sello, dict) and sello.get("inestable") is True:
                sin_huella.append({"id": ficha["id"], "url": url, "motivo": "la página cambia sola"})
                continue
            if not isinstance(sello, dict) or not isinstance(sello.get("sha256"), str):
                sin_huella.append({"id": ficha["id"], "url": url, "motivo": "sin impronta"})
                continue
            if url not in estados:
                estados[url] = estado_fuente(url, sello["sha256"], leer)
            estado, error = estados[url]
            if estado == "error":
                no_comprobadas.append({"id": ficha["id"], "url": url, "error": error})
            elif estado == "cambiada":
                senales.setdefault(ficha["id"], []).append(
                    {"tipo": "fuente_cambiada", "detalle": "La página oficial ha cambiado desde la última comprobación.",
                     "url": url})
    for url, (estado, _) in estados.items():
        inestables += estado == "inestable"
    no_comprobadas.sort(key=lambda x: (x["id"], x["url"]))
    sin_huella.sort(key=lambda x: (x["id"], x["url"]))
    return senales, no_comprobadas, inestables, sin_huella


def sellar_url(url, hoy, leer):
    """Due letture a qualche secondo di distanza: se differiscono la fonte è inestabile."""
    primera, error = leer(url)
    if error:
        print(f"vigía: fonte non sigillata {url}: {error}", file=sys.stderr)
        return None
    time.sleep(ESPERA)
    segunda, error = leer(url)
    if error:
        print(f"vigía: fonte non sigillata {url}: {error}", file=sys.stderr)
        return None
    return {"sha256": primera, "sellado_el": hoy.isoformat(), "inestable": segunda != primera}


def sellar(raiz, hoy, ids, leer=leer_url):
    fichas = cargar_fichas(raiz / "catalogo" / "fichas")
    if ids is not None:
        desconocidas = sorted(ids - {f["id"] for f in fichas})
        if desconocidas:
            print(f"vigía: schede inesistenti: {', '.join(desconocidas)}", file=sys.stderr)
        fichas = [f for f in fichas if f["id"] in ids]
    urls = sorted({u for f in fichas for u in urls_de(f)})
    ruta = raiz / "catalogo" / "vigia-huellas.json"
    previas = leer_huellas(ruta)
    final = dict(previas) if ids is not None else {}
    nuevas = inestables = fallidas = 0
    for i, url in enumerate(urls):
        if i:
            time.sleep(PAUSA)
        sello = sellar_url(url, hoy, leer)
        if sello is None:
            fallidas += 1
            if url in previas:
                final[url] = previas[url]  # una fonte non letta conserva la sua impronta precedente
            continue
        nuevas += 1
        inestables += sello["inestable"]
        final[url] = sello
    escribir_json(ruta, {u: final[u] for u in sorted(final)})
    print(f"vigía: {nuevas} fonti sigillate ({inestables} inestabili, che non daranno segnali), "
          f"{fallidas} non lette (resta la vecchia impronta, se c'era). File: {ruta}")
    return 0


# --- Il documento: web/data/vigia.json ----------------------------------------------------------

def construir(raiz, hoy, sin_red):
    fichas = cargar_fichas(raiz / "catalogo" / "fichas")
    convocatorias = cargar_convocatorias(raiz / "web" / "data" / "indice.json")
    senales = {}
    nombres = {}
    for ficha in fichas:
        senales.setdefault(ficha["id"], []).extend(senales_seguras(ficha, hoy, convocatorias))
        nombres[ficha["id"]] = ficha.get("nombre") if isinstance(ficha.get("nombre"), str) else ficha["id"]
    no_comprobadas, sin_huella = [], []
    if not sin_red:
        por_fuente, no_comprobadas, inestables, sin_huella = fuentes_cambiadas(
            fichas, leer_huellas(raiz / "catalogo" / "vigia-huellas.json"))
        for id_, lista in por_fuente.items():
            senales.setdefault(id_, []).extend(lista)
        if inestables:
            print(f"vigía: {inestables} fonti instabili oggi: nessun segnale per loro", file=sys.stderr)
    con = []
    for id_ in sorted(senales):
        lista = senales[id_]
        if lista:
            con.append({"id": id_, "nombre": nombres[id_], "senales": lista,
                        "aviso_publico": any(s["tipo"] in TIPOS_AVISO for s in lista)})
    return {"generado_el": hoy.isoformat(), "total_fichas": len(fichas), "con_senales": len(con),
            "fichas": con, "no_comprobadas": no_comprobadas, "sin_huella": sin_huella}


def documento_vuoto(hoy):
    return {"generado_el": hoy.isoformat(), "total_fichas": 0, "con_senales": 0, "fichas": [], "no_comprobadas": [], "sin_huella": []}


def valido(ruta):
    try:
        doc = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return isinstance(doc, dict) and isinstance(doc.get("fichas"), list)


def modo_normal(raiz, hoy, sin_red):
    salida = raiz / "web" / "data" / "vigia.json"
    try:
        doc = construir(raiz, hoy, sin_red)
    except Exception as e:  # imprevisto: il file precedente, se valido, resta; altrimenti uno vuoto
        print(f"Errore inatteso, {salida}: {type(e).__name__}: {breve(e)}", file=sys.stderr)
        if valido(salida):
            return 0
        doc = documento_vuoto(hoy)
    try:
        escribir_json(salida, doc)
    except OSError as e:
        print(f"Errore nello scrivere {salida}: {e}", file=sys.stderr)
        return 0
    avisos = sum(1 for f in doc["fichas"] if f["aviso_publico"])
    print(f"vigía: {doc['total_fichas']} schede, {doc['con_senales']} con segnali, {avisos} con avviso pubblico, "
          f"{len(doc['no_comprobadas'])} fonti non controllate. File: {salida}")
    return 0


# --- Issue su GitHub (con gh) -------------------------------------------------------------------

class GhFallito(Exception):
    pass


def gh(args, raiz, entrada=None):
    # senza testo da mandare, stdin è chiuso: gh non può restare in attesa di input
    flusso = {"input": entrada} if entrada is not None else {"stdin": subprocess.DEVNULL}
    try:
        r = subprocess.run([GH, *args], capture_output=True, text=True, timeout=120, cwd=str(raiz),
                           env={**os.environ, "GH_PROMPT_DISABLED": "1"}, **flusso)
    except (OSError, subprocess.SubprocessError) as e:
        raise GhFallito(f"gh non eseguibile ({type(e).__name__})")
    if r.returncode != 0:
        raise GhFallito(f"gh {args[0]} {args[1] if len(args) > 1 else ''} fallito (codice {r.returncode}): "
                        f"{breve(r.stderr, 300)}")
    return r.stdout


def ids_del_cuerpo(cuerpo):
    m = re.search(r"<!-- vigia-ids: ([^>]*?) -->", cuerpo or "")
    return [x.strip() for x in m.group(1).split(",") if x.strip()] if m else []


def cuerpo_issue(con):
    lineas = ["Fichas con señales de la vigía de hoy. Son avisos para revisar, no conclusiones.", ""]
    for f in con:
        lineas.append(f"### {f['nombre']} (`{f['id']}`)")
        for s in f["senales"]:
            lineas.append(f"- {s['detalle']}" + (f" {s['url']}" if s.get("url") else ""))
        lineas.append("")
    lineas.append(PIE_ISSUE)
    lineas.append(f"<!-- vigia-ids: {','.join(f['id'] for f in con)} -->")
    return "\n".join(lineas) + "\n"


def de_actions(issue):
    autor = issue.get("author") if isinstance(issue.get("author"), dict) else {}
    return autor.get("login") in ("github-actions", "github-actions[bot]", "app/github-actions")


def modo_issues(raiz):
    ruta = raiz / "web" / "data" / "vigia.json"
    try:
        doc = json.loads(ruta.read_text(encoding="utf-8"))
        if not isinstance(doc, dict) or not doc.get("total_fichas"):
            print(f"vigía: {ruta} senza schede lette: le issue restano come sono", file=sys.stderr)
            return 0
        con = [f for f in doc.get("fichas", []) if isinstance(f, dict) and f.get("senales")]
    except Exception as e:
        print(f"vigía: {ruta} non letto ({type(e).__name__}): le issue restano come sono", file=sys.stderr)
        return 0
    try:
        listado = json.loads(gh(["issue", "list", "--state", "open", "--limit", "200",
                                 "--json", "number,title,body,author"], raiz))
        # solo le issue aperte dal bot di GitHub Actions: una issue di un visitatore con lo stesso titolo non si tocca
        abiertas = sorted((i for i in listado if i.get("title") == TITULO_ISSUE and de_actions(i)),
                          key=lambda i: i["number"])
        if con:
            ids = [f["id"] for f in con]
            if not abiertas:
                gh(["issue", "create", "--title", TITULO_ISSUE, "--body-file", "-"], raiz, cuerpo_issue(con))
                print("vigía: issue creata")
            else:
                principal = abiertas[0]
                nuevos = [i for i in ids if i not in ids_del_cuerpo(principal.get("body"))]
                gh(["issue", "edit", str(principal["number"]), "--body-file", "-"], raiz, cuerpo_issue(con))
                if nuevos:
                    comentario = "Fichas nuevas con señales: " + ", ".join(f"`{i}`" for i in nuevos) + "."
                    gh(["issue", "comment", str(principal["number"]), "--body-file", "-"], raiz, comentario)
                for extra in abiertas[1:]:
                    gh(["issue", "close", str(extra["number"]), "--comment",
                        f"Cerrada: duplicada de #{principal['number']}."], raiz)
                print(f"vigía: issue #{principal['number']} aggiornata" + (f", {len(nuevos)} id nuovi" if nuevos else ""))
        else:
            for issue in abiertas:
                gh(["issue", "close", str(issue["number"]), "--comment",
                    "Cerrada automáticamente: hoy la vigía no encuentra fichas que revisar."], raiz)
                print(f"vigía: issue #{issue['number']} chiusa")
    except GhFallito as e:
        print(f"vigía: {e}", file=sys.stderr)
    except (ValueError, KeyError, TypeError) as e:
        print(f"vigía: risposta di gh non leggibile ({type(e).__name__})", file=sys.stderr)
    return 0


# --- Riga di comando ----------------------------------------------------------------------------

def fecha_argumento(valor):
    d = fecha(valor)
    if d is None:
        raise argparse.ArgumentTypeError("usa AAAA-MM-GG")
    return d


def main():
    parser = argparse.ArgumentParser(description="Vigía: segnala le schede di Tamiz che potrebbero essere cambiate.")
    parser.add_argument("--raiz", default=str(RAIZ), help="cartella con catalogo/, web/ (prove)")
    parser.add_argument("--hoy", type=fecha_argumento, help="data di riferimento AAAA-MM-GG (di default oggi)")
    parser.add_argument("--sin-red", action="store_true", help="salta i controlli di rete")
    parser.add_argument("--sellar", action="store_true", help="ricalcola le impronte delle fonti")
    parser.add_argument("--ids", help="con --sellar: solo queste schede, separate da virgole")
    parser.add_argument("--issues", action="store_true", help="aggiorna la issue «Vigía: fichas que revisar» con gh")
    args = parser.parse_args()
    raiz = Path(args.raiz).resolve()
    hoy = args.hoy or date.today()
    if args.issues:
        return modo_issues(raiz)
    if args.sellar:
        ids = {x.strip() for x in args.ids.split(",") if x.strip()} if args.ids else None
        try:
            return sellar(raiz, hoy, ids)
        except Exception as e:
            print(f"Errore inatteso nel sigillare: {type(e).__name__}: {breve(e)}", file=sys.stderr)
            return 1
    return modo_normal(raiz, hoy, args.sin_red)


if __name__ == "__main__":
    sys.exit(main())
