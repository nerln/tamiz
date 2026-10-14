#!/usr/bin/env python3
"""Costruisce web/data/catalogo.json e copia i profili d'esempio in web/data/ejemplos/.

Uso:
    python3 scripts/construir.py              # catalogo vero, da catalogo/
    python3 scripts/construir.py --ejemplo    # segnaposto, dalle schede di schema/esempi/
    opzioni: --hoy AAAA-MM-DD (data di actualizado_el, default oggi), --estricto

Fonde:
    catalogo/fichas/*.json         una scheda per file (un oggetto JSON, come vuole validar.py);
                                   i file che finiscono in -candidata.json restano FUORI dal build
    catalogo/ayuda_humana.json     se manca, elenco vuoto (lo dice)
    catalogo/glosario.json         se manca, elenco vuoto (lo dice)
    catalogo/grupos_paises.json    facoltativo; si aggiunge ai gruppi di base UE, EEE_no_UE, Suiza
    sitio.json                     il nome del sito, copiato in catalogo.sitio
Con --ejemplo le schede, ayuda_humana e glosario vengono da schema/esempi/.

Una scheda non "alta", senza leido_por_agente o con _revisar viene ESCLUSA e il build lo scrive
(con --estricto, invece, il build si ferma). Alla fine chiama scripts/validar.py sul catalogo
nuovo e sui profili d'esempio: solo se è verde il file viene scritto e gli esempi copiati.
Exit code 0 se il catalogo è stato scritto, 1 altrimenti. Solo libreria standard.
"""

import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "web" / "data" / "catalogo.json"
EJEMPLOS_DESTINO = RAIZ / "web" / "data" / "ejemplos"
PERFILES_EJEMPLO = [RAIZ / "schema" / "esempi" / "perfil-lucia.json",
                    RAIZ / "schema" / "esempi" / "perfil-rodrigo.json"]

# Finché nessuna persona ha rivisto le schede, il catalogo lo dichiara (docs/ESQUEMA.md §4.1).
# Quando una revisione umana completa c'è, si cambiano queste due costanti.
REDACTADO_CON_IA = True
REVISION_HUMANA = {"completa": False, "por": None, "el": None}

# Gruppi normativi di base (docs/ESQUEMA.md §4.3). Altri gruppi in catalogo/grupos_paises.json.
GRUPOS_BASE = {
    "UE": ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
           "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"],
    "EEE_no_UE": ["IS", "LI", "NO"],
    "Suiza": ["CH"],
}


def _leggi(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        sys.exit(f"ERRORE  {_rel(path)}: JSON non valido: {e}")


def _rel(p):
    try:
        return str(Path(p).resolve().relative_to(RAIZ))
    except ValueError:
        return str(p)


def _lista_facoltativa(path, nome):
    if not path.exists():
        print(f"AVVISO  {_rel(path)} non c'è: {nome} è un elenco vuoto.")
        return []
    doc = _leggi(path)
    if not isinstance(doc, list):
        sys.exit(f"ERRORE  {_rel(path)}: serve una lista JSON di {nome}.")
    return doc


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ejemplo", action="store_true", help="segnaposto dalle schede di schema/esempi/")
    ap.add_argument("--hoy", default=datetime.date.today().isoformat(), help="data di actualizado_el")
    ap.add_argument("--estricto", action="store_true", help="una scheda da escludere ferma il build")
    a = ap.parse_args(argv)
    try:
        datetime.date.fromisoformat(a.hoy)
    except ValueError:
        sys.exit(f"ERRORE  --hoy {a.hoy!r} non è una data AAAA-MM-DD")

    if a.ejemplo:
        base = RAIZ / "schema" / "esempi"
        dir_fichas, f_ayuda, f_glosario, f_grupos = base / "fichas", base / "ayuda_humana.json", base / "glosario.json", None
    else:
        base = RAIZ / "catalogo"
        dir_fichas, f_ayuda, f_glosario, f_grupos = (base / "fichas", base / "ayuda_humana.json",
                                                     base / "glosario.json", base / "grupos_paises.json")
    if not dir_fichas.is_dir():
        sys.exit(f"ERRORE  manca la cartella {_rel(dir_fichas)}/ (per il segnaposto: --ejemplo)")

    fichas, escluse = [], []
    for path in sorted(dir_fichas.glob("*.json")):
        if path.name.endswith("-candidata.json"):
            print(f"FUORI   {_rel(path)}: candidata, resta fuori dal build finché non è promossa")
            continue
        f = _leggi(path)
        if not isinstance(f, dict):
            sys.exit(f"ERRORE  {_rel(path)}: un file di fichas/ contiene una scheda sola, un oggetto JSON")
        motivi = []
        if f.get("confianza") != "alta":
            motivi.append(f"campo confianza è {f.get('confianza')!r}, serve \"alta\"")
        if not f.get("leido_por_agente"):
            motivi.append("manca il campo leido_por_agente")
        if "_revisar" in f:
            motivi.append("ha il campo _revisar")
        if motivi:
            escluse.append(f"ESCLUSA {_rel(path)} · ficha {f.get('id')}: " + "; ".join(motivi))
        else:
            fichas.append(f)
    for riga in escluse:
        print(riga)
    if escluse and a.estricto:
        print(f"ROSSO: {len(escluse)} schede da escludere e --estricto: catalogo NON scritto.")
        return 1
    fichas.sort(key=lambda f: str(f.get("id")))

    grupos = {k: list(v) for k, v in GRUPOS_BASE.items()}
    if f_grupos is not None and f_grupos.exists():
        extra = _leggi(f_grupos)
        if not isinstance(extra, dict):
            sys.exit(f"ERRORE  {_rel(f_grupos)}: serve un oggetto {{nome: [codici]}}")
        grupos.update(extra)

    f_sitio = RAIZ / "sitio.json"
    if not f_sitio.exists():
        sys.exit("ERRORE  manca sitio.json")

    catalogo = {
        "esquema": "tamiz-catalogo",
        "version": 1.1,
        "actualizado_el": a.hoy,
        "redactado_con_ia": REDACTADO_CON_IA,
        "revision_humana": dict(REVISION_HUMANA),
        "sitio": _leggi(f_sitio),
        "fichas": fichas,
        "ayuda_humana": _lista_facoltativa(f_ayuda, "ayuda_humana"),
        "grupos_paises": grupos,
        "glosario": _lista_facoltativa(f_glosario, "glosario"),
    }

    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    nuovo = SALIDA.with_name("catalogo.nuevo.json")
    nuovo.write_text(json.dumps(catalogo, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    sys.stdout.flush()
    esito = subprocess.run([sys.executable, str(RAIZ / "scripts" / "validar.py"), str(nuovo),
                            *map(str, PERFILES_EJEMPLO)])
    if esito.returncode != 0:
        nuovo.unlink()
        print(f"ROSSO: validar.py ha trovato errori: {_rel(SALIDA)} NON è stato toccato.")
        return 1
    os.replace(nuovo, SALIDA)
    EJEMPLOS_DESTINO.mkdir(parents=True, exist_ok=True)
    for p in PERFILES_EJEMPLO:
        shutil.copyfile(p, EJEMPLOS_DESTINO / p.name)
    print(f"Scritto {_rel(SALIDA)}: {len(fichas)} schede, {len(escluse)} escluse, "
          f"{len(catalogo['ayuda_humana'])} ayuda_humana, {len(catalogo['glosario'])} voci di glosario, "
          f"actualizado_el {a.hoy}{' (SEGNAPOSTO da schema/esempi/)' if a.ejemplo else ''}.")
    print(f"Copiati in {_rel(EJEMPLOS_DESTINO)}/: " + ", ".join(p.name for p in PERFILES_EJEMPLO))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
