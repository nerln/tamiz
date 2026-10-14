#!/usr/bin/env python3
"""Genera web/calendario.ics con i plazi verificati delle schede.

Uso:
    python3 scripts/ics.py                              # da catalogo/fichas/ -> web/calendario.ics
    python3 scripts/ics.py --fichas schema/esempi/fichas
    opzioni: --salida FILE, --hoy AAAA-MM-DD (default oggi), --sitio FILE

Entra nel calendario solo una scheda con plazo.verificado true, con plazo.fin presente
e plazo.fin >= hoy. Le schede verificate senza fin (diritti sempre aperti, convocatorie
annuali) non sono plazi con data: si scartano e si contano a parte.
Il SUMMARY è generico (nome breve e chi presenta, nessun dato della persona); la
DESCRIPTION porta il link alla scheda, la data di lettura e la fonte da controllare.
Se non resta nessun plazo, il file contiene un solo evento segnaposto di oggi, che non
è un plazo: RFC 5545 non ammette un calendario senza componenti.
Formato RFC 5545: CRLF, righe piegate a 75 ottetti, testo con escape. Solo libreria standard.
Esce con 1 se una scheda ha dati che non tornano (il file non viene scritto).
"""

import argparse
import datetime
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit

RAIZ = Path(__file__).resolve().parent.parent
FICHAS_DEF = RAIZ / "catalogo" / "fichas"
SALIDA_DEF = RAIZ / "web" / "calendario.ics"
SITIO = RAIZ / "sitio.json"

PRODID = "-//Tamiz//calendario de plazos//ES"
DESCRIPCION_CAL = "Plazos leídos en el texto oficial. Compruébalos siempre en la fuente."

TEXTO_SOLICITA = {
    "persona": "solicitud de la persona",
    "empresa": "la presenta la empresa",
    "universidad": "la presenta la universidad",
    "director_tesis": "la presenta el director o la directora de la tesis",
    "otro": "la presenta otra entidad: mira la ficha",
}

# Separatori che chiudono il nome breve: «FPU 2026 — contratos…», «Doctorados Industriales 2026 (AEI)», «Algo: resto».
SEPARADORES_NOMBRE = (" — ", " (", ":")


def fecha(texto, donde):
    try:
        return datetime.date.fromisoformat(texto)
    except (TypeError, ValueError):
        sys.exit(f"ERRORE  {donde}: data non valida {texto!r}")


def compacta(d):
    return d.strftime("%Y%m%d")


def esc(texto):
    """Escape RFC 5545 §3.3.11: barra rovesciata, punto e virgola, virgola, a capo."""
    return (texto.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
                 .replace("\r\n", "\\n").replace("\n", "\\n"))


def plegar(linea):
    """Spezza una riga in parti di al più 75 ottetti UTF-8; le successive iniziano con spazio.

    Non spezza mai un carattere multibyte a metà.
    """
    partes, actual, usados, limite = [], "", 0, 75
    for ch in linea:
        b = len(ch.encode("utf-8"))
        if usados + b > limite:
            partes.append(actual)
            actual, usados, limite = "", 0, 74  # 74 + lo spazio iniziale = 75
        actual += ch
        usados += b
    partes.append(actual)
    return [partes[0]] + [" " + p for p in partes[1:]]


def riga(nombre, valor):
    return "".join(parte + "\r\n" for parte in plegar(f"{nombre}:{valor}"))


def nombre_corto(nombre):
    cortes = [nombre.find(s) for s in SEPARADORES_NOMBRE if s in nombre]
    return (nombre[:min(cortes)] if cortes else nombre).strip()


def cargar_fichas(carpeta):
    if not carpeta.is_dir():
        sys.exit(f"ERRORE  non esiste la cartella {carpeta}")
    fichas = []
    for f in sorted(carpeta.glob("*.json")):
        if f.name.endswith("-candidata.json"):
            continue  # le candidate restano fuori dal calendario
        try:
            ficha = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            sys.exit(f"ERRORE  {f.name}: {e}")
        fichas.append((f.name, ficha))
    return fichas


def evento(ficha, nombre_archivo, sitio_url, host):
    donde = f"{nombre_archivo} ({ficha.get('id', '?')})"
    fid = ficha["id"]
    plazo = ficha["plazo"]
    fin = fecha(plazo["fin"], donde + " plazo.fin")
    solicita = ficha.get("solicita", "persona")
    if solicita not in TEXTO_SOLICITA:
        sys.exit(f"ERRORE  {donde}: solicita {solicita!r} non previsto")
    leido = fecha(ficha.get("leido_por_agente"), donde + " leido_por_agente")
    marca = leido.strftime("%Y%m%dT000000Z")
    scheda = f"{sitio_url}#ficha-{fid}"
    fuente = plazo.get("fuente", scheda)
    descrizione = (
        f"Ficha: {scheda}. Fecha leída en el texto oficial el {leido:%d/%m/%Y}; "
        f"compruébala en la fuente: {fuente}. No es un texto oficial."
    )
    righe = [
        "BEGIN:VEVENT",
        riga("UID", f"{fid}.{host}").rstrip("\r\n"),  # niente @: il file non deve contenerne
        riga("DTSTAMP", marca).rstrip("\r\n"),
        riga("LAST-MODIFIED", marca).rstrip("\r\n"),
        riga("DTSTART;VALUE=DATE", compacta(fin)).rstrip("\r\n"),
        riga("DTEND;VALUE=DATE", compacta(fin + datetime.timedelta(days=1))).rstrip("\r\n"),
        riga("SUMMARY", esc(f"Plazo: {nombre_corto(ficha['nombre'])} — {TEXTO_SOLICITA[solicita]}")).rstrip("\r\n"),
        riga("DESCRIPTION", esc(descrizione)).rstrip("\r\n"),
        riga("URL", ficha.get("url_oficial", scheda)).rstrip("\r\n"),
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
    ]
    return "".join(r + "\r\n" for r in righe)


def evento_segnaposto(hoy, sitio_url, host):
    """Unico evento quando non c'è nessun plazo: non è una scadenza, dice solo che non ce ne sono."""
    marca = hoy.strftime("%Y%m%dT000000Z")
    righe = [
        "BEGIN:VEVENT",
        riga("UID", f"sin-plazos.{host}").rstrip("\r\n"),
        riga("DTSTAMP", marca).rstrip("\r\n"),
        riga("LAST-MODIFIED", marca).rstrip("\r\n"),
        riga("DTSTART;VALUE=DATE", compacta(hoy)).rstrip("\r\n"),
        riga("DTEND;VALUE=DATE", compacta(hoy + datetime.timedelta(days=1))).rstrip("\r\n"),
        riga("SUMMARY", esc("Sin plazos verificados por ahora")).rstrip("\r\n"),
        riga("DESCRIPTION", esc(
            "No es un plazo. Ahora mismo no hay ningún plazo verificado con fecha futura. "
            f"Mira la web: {sitio_url}")).rstrip("\r\n"),
        riga("URL", sitio_url).rstrip("\r\n"),
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
    ]
    return "".join(r + "\r\n" for r in righe)


def costruisci(fichas, sitio, hoy):
    sitio_url = sitio["url"]
    host = urlsplit(sitio_url).netloc
    nombre_sitio = sitio["nombre"]
    eventos, scartate, senza_fin = [], 0, 0
    for nombre_archivo, ficha in fichas:
        plazo = ficha.get("plazo") or {}
        if plazo.get("verificado") is not True:
            scartate += 1
            continue
        if plazo.get("fin") is None:
            senza_fin += 1  # derecho abierto todo el año o convocatoria anual: nessuna data da mettere
            continue
        if fecha(plazo["fin"], nombre_archivo) < hoy:
            scartate += 1
            continue
        eventos.append((plazo["fin"], ficha["id"], evento(ficha, nombre_archivo, sitio_url, host)))
    eventos.sort()

    intestazione = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    testo = "".join(r + "\r\n" for r in intestazione)
    testo += riga("NAME", esc(f"{nombre_sitio}: plazos"))
    testo += riga("X-WR-CALNAME", esc(f"{nombre_sitio}: plazos"))
    testo += riga("X-WR-CALDESC", esc(DESCRIPCION_CAL))
    testo += riga("REFRESH-INTERVAL;VALUE=DURATION", "P1D")
    testo += riga("X-PUBLISHED-TTL", "P1D")
    if eventos:
        testo += "".join(e for _, _, e in eventos)
    else:
        testo += evento_segnaposto(hoy, sitio_url, host)
    testo += "END:VCALENDAR\r\n"
    return testo, len(eventos), scartate, senza_fin


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--fichas", type=Path, default=FICHAS_DEF,
                    help="cartella con una scheda per file (default catalogo/fichas)")
    ap.add_argument("--salida", type=Path, default=SALIDA_DEF)
    ap.add_argument("--sitio", type=Path, default=SITIO)
    ap.add_argument("--hoy", help="data di riferimento AAAA-MM-DD (default oggi)")
    args = ap.parse_args()

    hoy = fecha(args.hoy, "--hoy") if args.hoy else datetime.date.today()
    sitio = json.loads(args.sitio.read_text(encoding="utf-8"))
    fichas = cargar_fichas(args.fichas)
    testo, n_eventi, n_scartate, n_senza_fin = costruisci(fichas, sitio, hoy)

    args.salida.parent.mkdir(parents=True, exist_ok=True)
    args.salida.write_bytes(testo.encode("utf-8"))
    print(f"OK  {n_eventi} eventi su {len(fichas)} schede "
          f"(scartate {n_scartate} non verificate o scadute, {n_senza_fin} verificate senza fin, "
          f"hoy {hoy:%Y-%m-%d}) -> {args.salida}")


if __name__ == "__main__":
    main()
