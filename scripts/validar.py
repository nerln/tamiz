#!/usr/bin/env python3
"""Valida catalogo, schede e profili di Tamiz contro gli schemi v1.1 e le regole di docs/ESQUEMA.md §7.

Uso:
    python3 scripts/validar.py                 # web/data/catalogo.json + i due profili d'esempio
    python3 scripts/validar.py FILE_O_CARTELLA ...

Riconosce il tipo di ogni file dal contenuto:
    {"esquema": "tamiz-catalogo", ...}   catalogo intero
    {"esquema": "tamiz-perfil", ...}     profilo
    {"id": ..., "requisitos": ...}       una scheda sola (contro #/$defs/ficha)
    [ {..."que_hace"...}, ... ]          elenco ayuda_humana
    [ {..."termino"...}, ... ]           glosario
Una cartella vale tutti i suoi *.json.

Una scheda dentro una cartella che si chiama `fichas/` deve avere confianza "alta" (salvo i file
che finiscono in -candidata.json, che construir.py lascia fuori). Nel catalogo intero tutte le
schede devono essere "alta".

Usa `jsonschema` se è importabile (un python con jsonschema instalado, por ejemplo .venv), altrimenti un
validatore interno minimo che copre le parole chiave usate dai nostri schemi; lo dice in uscita.
Exit code 0 se tutto è valido, 1 se c'è almeno un errore. Solo libreria standard.
"""

import datetime
import json
import re
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ESQ_PERFIL = RAIZ / "schema" / "perfil.schema.json"
ESQ_CATALOGO = RAIZ / "schema" / "catalogo.schema.json"
POR_DEFECTO = [
    RAIZ / "web" / "data" / "catalogo.json",
    RAIZ / "schema" / "esempi" / "perfil-lucia.json",
    RAIZ / "schema" / "esempi" / "perfil-rodrigo.json",
]
VENV = str(RAIZ / ".venv" / "bin" / "python")

# Parole che non possono comparire in nessun testo (docs/ESQUEMA.md §6.1), con le forme
# vicine: «te tocará», «te tocan», «tienes todo el derecho», «tienes derechos».
PROHIBIDAS = re.compile(r"\b(cumples|te\s+toca\w*|tienes\s+(?:\w+\s+){0,3}derechos?)\b", re.IGNORECASE)
FECHA_COMPLETA = re.compile(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")

try:  # pragma: no cover - dipende dall'ambiente
    import jsonschema
    from importlib.metadata import version as _version

    MOTORE = f"jsonschema {_version('jsonschema')}"
except ImportError:  # pragma: no cover
    jsonschema = None
    MOTORE = (
        "validatore interno minimo (jsonschema non è importabile con questo Python; "
        f"per quello completo: {VENV} scripts/validar.py)"
    )


# --------------------------------------------------------------------------------------
# Validatore interno minimo (le parole chiave che usano schema/*.schema.json)
# --------------------------------------------------------------------------------------

def _tipo_ok(t, x):
    if isinstance(t, list):
        return any(_tipo_ok(u, x) for u in t)
    if t == "object":
        return isinstance(x, dict)
    if t == "array":
        return isinstance(x, list)
    if t == "string":
        return isinstance(x, str)
    if t == "boolean":
        return isinstance(x, bool)
    if t == "null":
        return x is None
    if t == "integer":
        return (isinstance(x, int) and not isinstance(x, bool)) or (isinstance(x, float) and x.is_integer())
    if t == "number":
        return isinstance(x, (int, float)) and not isinstance(x, bool)
    return True


def _uguali(a, b):
    """Uguaglianza JSON: true non è 1."""
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return a == b
    if type(a) is not type(b):
        return False
    if isinstance(a, list):
        return len(a) == len(b) and all(_uguali(x, y) for x, y in zip(a, b))
    if isinstance(a, dict):
        return a.keys() == b.keys() and all(_uguali(a[k], b[k]) for k in a)
    return a == b


def _risolvi(root, ref):
    if not ref.startswith("#/"):
        raise ValueError(f"$ref non locale: {ref}")
    nodo = root
    for parte in ref[2:].split("/"):
        nodo = nodo[parte.replace("~1", "/").replace("~0", "~")]
    return nodo


def _valida_interno(s, x, path, root, out):
    if s is True:
        return
    if s is False:
        out.append((path, "valore non ammesso qui"))
        return
    if "$ref" in s:
        _valida_interno(_risolvi(root, s["$ref"]), x, path, root, out)
    if "type" in s and not _tipo_ok(s["type"], x):
        out.append((path, f"tipo sbagliato: serve {s['type']}, c'è {json.dumps(x, ensure_ascii=False)[:60]}"))
        return
    if "const" in s and not _uguali(s["const"], x):
        out.append((path, f"deve valere {json.dumps(s['const'], ensure_ascii=False)}, c'è {json.dumps(x, ensure_ascii=False)[:60]}"))
    if "enum" in s and not any(_uguali(v, x) for v in s["enum"]):
        out.append((path, f"valore {json.dumps(x, ensure_ascii=False)[:60]} non è fra quelli ammessi {s['enum']}"))
    if isinstance(x, str):
        if "minLength" in s and len(x) < s["minLength"]:
            out.append((path, f"testo troppo corto (minimo {s['minLength']})"))
        if "maxLength" in s and len(x) > s["maxLength"]:
            out.append((path, f"testo troppo lungo (massimo {s['maxLength']})"))
        if "pattern" in s and not re.search(s["pattern"], x):
            out.append((path, f"{x[:60]!r} non rispetta il formato {s['pattern']}"))
    if _tipo_ok("number", x):
        if "minimum" in s and x < s["minimum"]:
            out.append((path, f"{x} è sotto il minimo {s['minimum']}"))
        if "maximum" in s and x > s["maximum"]:
            out.append((path, f"{x} è sopra il massimo {s['maximum']}"))
    if isinstance(x, dict):
        for k in s.get("required", []):
            if k not in x:
                out.append((path + [k], "campo obbligatorio mancante"))
        props = s.get("properties", {})
        for k, v in x.items():
            if k in props:
                _valida_interno(props[k], v, path + [k], root, out)
            elif "additionalProperties" in s:
                ap = s["additionalProperties"]
                if ap is False:
                    out.append((path + [k], "campo non previsto dallo schema"))
                else:
                    _valida_interno(ap, v, path + [k], root, out)
            if "propertyNames" in s:
                _valida_interno(s["propertyNames"], k, path + [k], root, out)
    if isinstance(x, list):
        if "items" in s:
            for i, v in enumerate(x):
                _valida_interno(s["items"], v, path + [i], root, out)
        if "minItems" in s and len(x) < s["minItems"]:
            out.append((path, f"servono almeno {s['minItems']} elementi"))
        if "maxItems" in s and len(x) > s["maxItems"]:
            out.append((path, f"al massimo {s['maxItems']} elementi"))
        if s.get("uniqueItems"):
            for i in range(len(x)):
                if any(_uguali(x[i], x[j]) for j in range(i)):
                    out.append((path + [i], "elemento ripetuto"))
    if "allOf" in s:
        for sub in s["allOf"]:
            _valida_interno(sub, x, path, root, out)
    if "anyOf" in s:
        tentativi = []
        for sub in s["anyOf"]:
            e = []
            _valida_interno(sub, x, path, root, e)
            if not e:
                break
            tentativi.append(e)
        else:
            # L'alternativa più vicina: meno errori, a parità quella con l'errore più profondo.
            migliore = min(tentativi, key=lambda e: (
                len(e), sum(1 for _, m in e if m.startswith("deve valere")), -max(len(p) for p, _ in e)))
            out.extend(migliore)
    if "not" in s:
        e = []
        _valida_interno(s["not"], x, path, root, e)
        if not e:
            out.append((path, "valore vietato dallo schema"))
    if "if" in s:
        e = []
        _valida_interno(s["if"], x, path, root, e)
        if not e and "then" in s:
            _valida_interno(s["then"], x, path, root, out)
        elif e and "else" in s:
            _valida_interno(s["else"], x, path, root, out)


# --------------------------------------------------------------------------------------

_SCHEMI = {}


def _schema(file, sotto=None):
    """Lo schema radice, o uno schema che punta a #/$defs/<sotto> conservando i $defs."""
    if file not in _SCHEMI:
        _SCHEMI[file] = json.loads(file.read_text(encoding="utf-8"))
    root = _SCHEMI[file]
    if sotto is None:
        return root
    return {"$schema": root.get("$schema"), "$defs": root["$defs"], "$ref": f"#/$defs/{sotto}"}


def _foglie(e):
    """Per un anyOf fallito, gli errori dell'alternativa più vicina (meno errori, meno errori
    sul discriminante `const`, errore più profondo), scendendo negli anyOf annidati."""
    if not e.context:
        return [e]
    gruppi = {}
    for c in e.context:
        gruppi.setdefault(c.relative_schema_path[0], []).append(c)
    migliore = min(gruppi.values(), key=lambda g: (
        len(g), sum(1 for c in g if c.validator == "const"), -max(len(c.absolute_path) for c in g)))
    return [f for c in migliore for f in _foglie(c)]


def errori_schema(schema, doc):
    """Lista di (percorso, messaggio)."""
    if jsonschema is not None:
        v = jsonschema.Draft202012Validator(schema)
        out = []
        foglie = [f for e in v.iter_errors(doc) for f in _foglie(e)]
        for e in sorted(foglie, key=lambda e: list(map(str, e.absolute_path))):
            path = list(e.absolute_path)
            msg = e.message
            if e.validator == "required":
                m = re.match(r"'([^']+)' is a required property", e.message)
                if m:
                    path.append(m.group(1))
                    msg = "campo obbligatorio mancante"
            elif e.validator == "additionalProperties":
                m = re.search(r"\('([^']+)' was unexpected\)", e.message)
                if m:
                    path.append(m.group(1))
                    msg = "campo non previsto dallo schema"
            out.append((path, msg))
        return out
    out = []
    _valida_interno(schema, doc, [], schema, out)
    return out


# --------------------------------------------------------------------------------------
# Rapporto
# --------------------------------------------------------------------------------------

class Rapporto:
    def __init__(self):
        self.errori = []
        self.avvisi = []

    def errore(self, file, dove, campo, msg):
        self.errori.append(_riga("ERRORE", file, dove, campo, msg))

    def avviso(self, file, dove, campo, msg):
        self.avvisi.append(_riga("AVVISO", file, dove, campo, msg))


def _rel(file):
    try:
        return str(Path(file).resolve().relative_to(RAIZ))
    except ValueError:
        return str(file)


def _riga(livello, file, dove, campo, msg):
    pezzi = [f"{livello}  {_rel(file)}"]
    if dove:
        pezzi.append(dove)
    if campo:
        pezzi.append(f"campo {campo}")
    return " · ".join(pezzi) + f": {msg}"


def _campo(path):
    s = ""
    for p in path:
        s += f"[{p}]" if isinstance(p, int) else (f".{p}" if s else str(p))
    return s


def _dove_catalogo(doc, path):
    """('ficha <id>', resto del percorso) per un percorso dentro un catalogo."""
    if len(path) >= 2 and path[0] in ("fichas", "ayuda_humana") and isinstance(path[1], int):
        lista = doc.get(path[0]) if isinstance(doc, dict) else None
        ident = None
        if isinstance(lista, list) and path[1] < len(lista) and isinstance(lista[path[1]], dict):
            ident = lista[path[1]].get("id")
        nome = "ficha" if path[0] == "fichas" else "ayuda_humana"
        return f"{nome} {ident or '#' + str(path[1])}", path[2:]
    return "catalogo", path


def _fecha(s):
    if not isinstance(s, str) or not FECHA_COMPLETA.match(s):
        return None
    try:
        return datetime.date.fromisoformat(s)
    except ValueError:
        return None


def _stringhe(x, path=()):
    if isinstance(x, str):
        yield list(path), x
    elif isinstance(x, dict):
        for k, v in x.items():
            yield from _stringhe(v, path + (k,))
    elif isinstance(x, list):
        for i, v in enumerate(x):
            yield from _stringhe(v, path + (i,))


def _parole_proibite(r, file, dove, oggetto, prefisso=()):
    """Cerca nei testi; non negli id e negli URL, che non sono testo da leggere."""
    for path, s in _stringhe(oggetto, tuple(prefisso)):
        if (path and path[-1] in ("id", "ayuda")) or s.startswith("https://"):
            continue
        m = PROHIBIDAS.search(s)
        if m:
            r.errore(file, dove, _campo(path), f"parola proibita «{m.group(0)}» nel testo")


def _nodi(requisitos, path):
    """Tutti i nodi (regole e gruppi) con il loro percorso."""
    if not isinstance(requisitos, list):
        return
    for i, n in enumerate(requisitos):
        if not isinstance(n, dict):
            continue
        p = path + [i]
        yield p, n
        for chiave in ("any_of", "all_of"):
            if chiave in n:
                yield from _nodi(n[chiave], p + [chiave])


# --------------------------------------------------------------------------------------
# Controlli oltre lo schema
# --------------------------------------------------------------------------------------

def controlla_ficha(r, file, f, dove, richiede_alta, prefisso=()):
    """Date reali, ordine delle date, confianza, _revisar, parole proibite. `prefisso` è il
    percorso della scheda dentro il file (vuoto per una scheda sola)."""
    if not isinstance(f, dict):
        return
    c = lambda *p: _campo(list(p))  # noqa: E731 - percorso relativo alla scheda
    for campo in ("leido_por_agente", "verificado_el", "revisar_antes_de"):
        v = f.get(campo)
        if isinstance(v, str) and _fecha(v) is None:
            r.errore(file, dove, c(campo), f"data non valida {v!r}")
    plazo = f.get("plazo") if isinstance(f.get("plazo"), dict) else {}
    for campo in ("inicio", "fin"):
        v = plazo.get(campo)
        if isinstance(v, str) and _fecha(v) is None:
            r.errore(file, dove, c("plazo", campo), f"data non valida {v!r}")
    leido, revisar = _fecha(f.get("leido_por_agente")), _fecha(f.get("revisar_antes_de"))
    verif = _fecha(f.get("verificado_el"))
    if leido and revisar and not revisar > leido:
        r.errore(file, dove, "revisar_antes_de",
                 f"{revisar} deve essere dopo leido_por_agente ({leido})")
    if verif and revisar and verif > revisar:
        r.errore(file, dove, "verificado_el", f"{verif} è dopo revisar_antes_de ({revisar})")
    ini, fin = _fecha(plazo.get("inicio")), _fecha(plazo.get("fin"))
    if ini and fin and ini > fin:
        r.errore(file, dove, "plazo.inicio", f"{ini} è dopo plazo.fin ({fin})")
    if richiede_alta:
        if f.get("confianza") != "alta":
            r.errore(file, dove, "confianza",
                     f"è {f.get('confianza')!r}: una scheda pubblicata (o in fichas/) deve essere \"alta\"")
        if "_revisar" in f:
            r.errore(file, dove, "_revisar", "una scheda con _revisar non si pubblica")
    ident = f.get("id")
    comp = f.get("compatibilidad") if isinstance(f.get("compatibilidad"), dict) else {}
    for lista in ("incompatible_con", "compatible_con"):
        if isinstance(comp.get(lista), list) and ident in comp[lista]:
            r.errore(file, dove, f"compatibilidad.{lista}", "la scheda cita se stessa")
    _parole_proibite(r, file, dove, f)


def controlla_catalogo(r, file, doc):
    if not isinstance(doc, dict):
        return set()
    fichas = doc.get("fichas") if isinstance(doc.get("fichas"), list) else []
    ayudas = doc.get("ayuda_humana") if isinstance(doc.get("ayuda_humana"), list) else []
    grupos = doc.get("grupos_paises") if isinstance(doc.get("grupos_paises"), dict) else {}
    if "actualizado_el" in doc and _fecha(doc.get("actualizado_el")) is None:
        r.errore(file, "catalogo", "actualizado_el", f"data non valida {doc.get('actualizado_el')!r}")
    rh = doc.get("revision_humana")
    if isinstance(rh, dict) and isinstance(rh.get("el"), str) and _fecha(rh["el"]) is None:
        r.errore(file, "catalogo", "revision_humana.el", f"data non valida {rh['el']!r}")

    ids_ayuda = set()
    for i, a in enumerate(ayudas):
        if not isinstance(a, dict):
            continue
        dove = f"ayuda_humana {a.get('id') or '#' + str(i)}"
        if a.get("id") in ids_ayuda:
            r.errore(file, dove, "id", "id ripetuto fra gli ayuda_humana")
        ids_ayuda.add(a.get("id"))
        v = a.get("verificado_el")
        if isinstance(v, str) and _fecha(v) is None:
            r.errore(file, dove, "verificado_el", f"data non valida {v!r}")
        _parole_proibite(r, file, dove, a)

    ids = set()
    for i, f in enumerate(fichas):
        if not isinstance(f, dict):
            continue
        ident = f.get("id")
        dove = f"ficha {ident or '#' + str(i)}"
        if ident in ids:
            r.errore(file, dove, "id", "id ripetuto fra le schede")
        ids.add(ident)
    for i, f in enumerate(fichas):
        if not isinstance(f, dict):
            continue
        dove = f"ficha {f.get('id') or '#' + str(i)}"
        controlla_ficha(r, file, f, dove, richiede_alta=True)
        for j, a in enumerate(f.get("ayuda_humana") or []):
            if isinstance(a, str) and a not in ids_ayuda:
                r.errore(file, dove, f"ayuda_humana[{j}]", f"{a!r} non esiste in catalogo.ayuda_humana")
        comp = f.get("compatibilidad") if isinstance(f.get("compatibilidad"), dict) else {}
        for lista in ("incompatible_con", "compatible_con"):
            for j, x in enumerate(comp.get(lista) or []):
                if isinstance(x, str) and x not in ids:
                    r.errore(file, dove, f"compatibilidad.{lista}[{j}]",
                             f"{x!r} non è una scheda di questo catalogo")
        ha_residencia = False
        for p, n in _nodi(f.get("requisitos"), ["requisitos"]):
            if isinstance(n.get("campo"), str) and n["campo"].startswith("residencia."):
                ha_residencia = True
            g = n.get("valor_grupo")
            if g is not None and g not in grupos:
                r.errore(file, dove, _campo(p + ["valor_grupo"]), f"il gruppo {g!r} non esiste in grupos_paises")
        if f.get("ambito") not in (None, "EU") and not ha_residencia:
            r.avviso(file, dove, "requisitos",
                     f"ambito {f.get('ambito')} senza nessuna regola su residencia.* (§7.7, non blocca)")
    _parole_proibite(r, file, "catalogo", doc.get("glosario") or [], ["glosario"])
    _parole_proibite(r, file, "catalogo", doc.get("sitio") or {}, ["sitio"])
    return ids


def controlla_perfil(r, file, doc):
    if not isinstance(doc, dict):
        return
    if "actualizado_el" in doc and _fecha(doc.get("actualizado_el")) is None:
        r.errore(file, "perfil", "actualizado_el", f"data non valida {doc.get('actualizado_el')!r}")
    for path, s in _stringhe(doc):
        if path and isinstance(path[-1], str) and (path[-1].endswith("_desde") or path[-1].endswith("_hasta")):
            if FECHA_COMPLETA.match(s) and _fecha(s) is None:
                r.errore(file, "perfil", _campo(path), f"data non valida {s!r}")
    for i, s in enumerate(doc.get("solicitudes") or []):
        if isinstance(s, dict) and isinstance(s.get("fecha"), str) and _fecha(s["fecha"]) is None:
            r.errore(file, "perfil", f"solicitudes[{i}].fecha", f"data non valida {s['fecha']!r}")
    _parole_proibite(r, file, "perfil", doc)


# --------------------------------------------------------------------------------------

def tipo_di(doc):
    if isinstance(doc, dict):
        e = doc.get("esquema")
        if e == "tamiz-catalogo":
            return "catalogo"
        if e == "tamiz-perfil":
            return "perfil"
        if isinstance(e, str) and e.endswith(("-perfil", "-catalogo")):
            return "v1"
        if "id" in doc and ("requisitos" in doc or "plazo" in doc or "confianza" in doc):
            return "ficha"
        if "esquema" not in doc and ("persona" in doc or "residencia" in doc):
            return "perfil_v0"
    if isinstance(doc, list):
        if all(isinstance(x, dict) and "que_hace" in x for x in doc) and doc:
            return "ayuda_humana"
        if all(isinstance(x, dict) and "termino" in x for x in doc) and doc:
            return "glosario"
        if not doc:
            return "vuoto"
    return None


def espandi(argomenti):
    out = []
    for a in argomenti:
        p = Path(a)
        if p.is_dir():
            out.extend(sorted(p.glob("*.json")))
        else:
            out.append(p)
    return out


def main(argv):
    files = espandi(argv) if argv else POR_DEFECTO
    print(f"Validatore: {MOTORE}")
    r = Rapporto()
    ids_catalogo = None
    profili = []
    contati = 0
    for file in files:
        if not file.exists():
            r.errore(file, None, None, "il file non esiste")
            continue
        try:
            doc = json.loads(file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            r.errore(file, None, None, f"JSON non valido: {e}")
            continue
        tipo = tipo_di(doc)
        contati += 1
        if tipo == "catalogo":
            for path, msg in errori_schema(_schema(ESQ_CATALOGO), doc):
                dove, resto = _dove_catalogo(doc, path)
                r.errore(file, dove, _campo(resto) or None, msg)
            ids = controlla_catalogo(r, file, doc)
            ids_catalogo = (ids_catalogo or set()) | ids
        elif tipo == "perfil":
            for path, msg in errori_schema(_schema(ESQ_PERFIL), doc):
                r.errore(file, "perfil", _campo(path) or None, msg)
            controlla_perfil(r, file, doc)
            profili.append((file, doc))
        elif tipo == "ficha":
            dove = f"ficha {doc.get('id')}"
            for path, msg in errori_schema(_schema(ESQ_CATALOGO, "ficha"), doc):
                r.errore(file, dove, _campo(path) or None, msg)
            richiede_alta = file.parent.name == "fichas" and not file.name.endswith("-candidata.json")
            controlla_ficha(r, file, doc, dove, richiede_alta)
        elif tipo == "ayuda_humana":
            sch = _schema(ESQ_CATALOGO, "ayuda_humana")
            vista = set()
            for i, a in enumerate(doc):
                dove = f"ayuda_humana {a.get('id') or '#' + str(i)}"
                for path, msg in errori_schema(sch, a):
                    r.errore(file, dove, _campo(path) or None, msg)
                if a.get("id") in vista:
                    r.errore(file, dove, "id", "id ripetuto")
                vista.add(a.get("id"))
                _parole_proibite(r, file, dove, a)
        elif tipo == "glosario":
            sch = _schema(ESQ_CATALOGO, "termino_glosario")
            for i, t in enumerate(doc):
                for path, msg in errori_schema(sch, t):
                    r.errore(file, f"glosario #{i}", _campo(path) or None, msg)
            _parole_proibite(r, file, "glosario", doc)
        elif tipo == "vuoto":
            r.avviso(file, None, None, "elenco vuoto")
        elif tipo == "v1":
            r.errore(file, None, "esquema",
                     f"{doc.get('esquema')!r} è uno schema v1 con un altro nome: va convertito a v1.1 (docs/ESQUEMA.md §8.0)")
        elif tipo == "perfil_v0":
            r.errore(file, None, "esquema", "profilo v0 senza esquema: va convertito (docs/ESQUEMA.md §8.1)")
        else:
            r.errore(file, None, None, "non riconosco il tipo di file (catalogo, perfil, ficha, ayuda_humana, glosario)")

    # §7.8: le solicitudes dei profili d'esempio citano schede pubblicate.
    if ids_catalogo is not None:
        for file, doc in profili:
            if "ejemplo" not in doc:
                continue
            for i, s in enumerate(doc.get("solicitudes") or []):
                if isinstance(s, dict) and s.get("ayuda") not in ids_catalogo:
                    r.errore(file, "perfil", f"solicitudes[{i}].ayuda",
                             f"{s.get('ayuda')!r} non è una scheda del catalogo validato insieme")

    for riga in r.avvisi:
        print(riga)
    for riga in r.errori:
        print(riga)
    if r.errori:
        print(f"ROSSO: {len(r.errori)} errori in {contati} file.")
        return 1
    print(f"VERDE: {contati} file validi ({len(r.avvisi)} avvisi).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
