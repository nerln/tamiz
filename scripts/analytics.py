#!/usr/bin/env python3
"""Cloudflare Web Analytics: il conteggio delle visite si accende o si spegne da sitio.json.

Il token sta in sitio.json, campo analytics.cloudflare_token: 32 caratteri esadecimali, oppure
vuoto. Con il token pieno:
  - ogni HTML di web/ ha lo script di Cloudflare una volta sola, con defer e data-cf-beacon
    col token;
  - la CSP di ogni HTML ammette i due host di Cloudflare: static.cloudflareinsights.com in
    script-src e cloudflareinsights.com in connect-src. Il resto resta 'self';
  - privacidad.html descrive il conteggio (apartado 9) e cambia i paragrafi 2, 3, 4 e 5 che
    lo riguardano.
Con il token vuoto non resta niente di tutto questo: le pagine tornano come prima.

Uso:
    python3 scripts/analytics.py                    allinea web/ al token di sitio.json
    python3 scripts/analytics.py --radice CARTELLA  lo stesso su un'altra cartella (prove, esportazione)
    python3 scripts/analytics.py --stato            stampa pieno oppure vuoto
    python3 scripts/analytics.py --controlla        non scrive: esce 1 se web/ non dice quello che dice il token

Esce 0 se fatto o pulito, 1 se una regola non torna, 2 se manca un file o la configurazione.
Solo libreria standard. Chiamato da scripts/construir.py e da scripts/controles.sh (controllo l).
"""

import argparse
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

SCRIPT_HOST = "https://static.cloudflareinsights.com"
CONNECT_HOST = "https://cloudflareinsights.com"
BEACON_SRC = SCRIPT_HOST + "/beacon.min.js"
CSP_VUOTA = "default-src 'self'"
TOKEN_RE = re.compile(r"^[0-9a-f]{32}$")
SERVIZIO = "Cloudflare Web Analytics"
PRIVACIDAD = "privacidad.html"

BLOCCO_INI = "<!--analitica:beacon-->"
BLOCCO_FIN = "<!--/analitica:beacon-->"
BLOCCO_RE = re.compile(r"[ \t]*" + re.escape(BLOCCO_INI) + r".*?" + re.escape(BLOCCO_FIN) + r"\n", re.S)
META_CSP_RE = re.compile(r'<meta\b[^>]*http-equiv="Content-Security-Policy"[^>]*>', re.I)
HEAD_FIN_RE = re.compile(r"</head>", re.I)

# Paragrafi di privacidad.html che cambiano con il token: (nome, testo spento, testo acceso).
# Il testo spento è quello che la pagina aveva prima; quello acceso lo dice in chiaro.
PARAGRAFI_OFF = {
    "resumen": "<p><strong>En resumen:</strong> Tamiz no recoge datos personales. Tus respuestas y tu perfil se quedan en tu dispositivo y no se envían a ningún servidor.</p>",
    "finalidad": "<p>Tamiz no recoge datos personales. Las respuestas del cuestionario y tu perfil se procesan únicamente en tu dispositivo, con la única finalidad de mostrarte los resultados. No se envían a ningún servidor, ni nuestro ni de terceros.</p>",
    "cookies": "<p>Tamiz no usa cookies, ni herramientas de analítica, ni publicidad, ni contenidos de terceros (fuentes, scripts o vídeos externos).</p>",
    "destinatarios": "<p>La web está alojada en GitHub Pages, de GitHub, Inc. Para servir las páginas, GitHub recibe tu dirección IP y los datos técnicos de la solicitud (navegador, página pedida, fecha y hora). GitHub trata esos datos como responsable autónomo, conforme a su <a href=\"https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement\">declaración de privacidad</a>. No hay otros destinatarios.</p>",
    "transferencias": "<p>GitHub trata los datos en Estados Unidos. La transferencia está amparada por el Marco de Privacidad de Datos UE-EE. UU. (Data Privacy Framework), al que GitHub, Inc. está adherida.</p>",
    "conservacion": "<p>Tamiz no conserva datos personales. Los datos que introduces permanecen en tu dispositivo hasta que los borres con «Borrar todo» o cierres la página. GitHub conserva los datos técnicos durante los plazos que indica su declaración de privacidad.</p>",
    "visitas": None,
}
PARAGRAFI_ON = {
    "resumen": "<p><strong>En resumen:</strong> tus respuestas y tu perfil se quedan en tu dispositivo y no se envían a ningún servidor. Solo contamos las visitas, sin cookies y en cifras agregadas (apartado 9).</p>",
    "finalidad": "<p>El cuestionario no recoge datos personales: las respuestas y tu perfil se procesan únicamente en tu dispositivo, con la única finalidad de mostrarte los resultados, y no se envían a ningún servidor, ni nuestro ni de terceros. Aparte, Tamiz cuenta las visitas a las páginas con Cloudflare Web Analytics (apartado 9).</p>",
    "cookies": "<p>Tamiz no usa cookies, ni publicidad, ni fuentes, vídeos ni contenidos de terceros. El único script de terceros es el del recuento de visitas (apartado 9), que tampoco usa cookies.</p>",
    "destinatarios": "<p>La web está alojada en GitHub Pages, de GitHub, Inc. Para servir las páginas, GitHub recibe tu dirección IP y los datos técnicos de la solicitud (navegador, página pedida, fecha y hora). GitHub trata esos datos como responsable autónomo, conforme a su <a href=\"https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement\">declaración de privacidad</a>. Para contar las visitas (apartado 9), Cloudflare, Inc. recibe tu dirección IP y la dirección de la página. No hay otros destinatarios.</p>",
    "transferencias": "<p>GitHub y Cloudflare, Inc. tratan los datos en Estados Unidos. Las transferencias están amparadas por el Marco de Privacidad de Datos UE-EE. UU. (Data Privacy Framework), al que GitHub, Inc. y Cloudflare, Inc. están adheridas.</p>",
    "conservacion": "<p>Tamiz no conserva datos personales. Los datos que introduces permanecen en tu dispositivo hasta que los borres con «Borrar todo» o cierres la página. GitHub conserva los datos técnicos durante los plazos que indica su declaración de privacidad. Cloudflare conserva los datos del recuento según el apartado 9.</p>",
    "visitas": (
        "<h2>9. Recuento de visitas</h2>\n"
        "    <p>Para contar las visitas, Tamiz usa Cloudflare Web Analytics. Cuando se carga una página, un pequeño script de Cloudflare envía la dirección de la página, que solo incluye el nombre de la sección o de la ficha que abres, la página de la que vienes, el tipo de navegador y datos sobre los tiempos de carga. Tus respuestas nunca forman parte de la dirección de la página, así que no llegan a Cloudflare.</p>\n"
        "    <p>Cloudflare recibe tu dirección IP, como cualquiera que te entrega un archivo, y de ella deduce el país. Según Cloudflare, el script no usa cookies, no guarda nada en tu dispositivo y no construye perfiles de los visitantes. Tamiz solo ve cifras agregadas. Cloudflare conserva los datos detallados 7 días y los agregados hasta 6 meses.</p>\n"
        "    <p>Cloudflare, Inc. tiene su sede en Estados Unidos y está adherida al Marco de Privacidad de Datos UE-EE. UU. (Data Privacy Framework); se aplica <a href=\"https://www.cloudflare.com/privacypolicy/\" rel=\"noopener\">su política de privacidad</a>. La base jurídica es el interés legítimo de Tamiz en saber qué páginas se leen. Un bloqueador de contenidos lo impide.</p>"
    ),
}


def cuerpo(testo):
    """Il contenuto fra due marcatori: sempre a capo e rientro, anche quando è vuoto."""
    if testo is None:
        return "\n    "
    return "\n    " + testo + "\n    "


def marcatore(nome):
    return re.compile(r"<!--analitica:%s-->(?P<corpo>.*?)<!--/analitica:%s-->" % (nome, nome), re.S)


def csp(token):
    if not token:
        return CSP_VUOTA
    return f"{CSP_VUOTA}; script-src 'self' {SCRIPT_HOST}; connect-src 'self' {CONNECT_HOST}"


def blocco_beacon(token):
    dato = json.dumps({"token": token}, separators=(",", ":"))
    return (
        f"  {BLOCCO_INI}\n"
        f"  <script defer src=\"{BEACON_SRC}\" data-cf-beacon='{dato}'></script>\n"
        f"  {BLOCCO_FIN}\n"
    )


def leggi_token(radice):
    """Il token da sitio.json. Errore (stringa) se il file manca, non è JSON o il campo non c'è."""
    f = radice / "sitio.json"
    if not f.exists():
        return None, f"manca {f.name}"
    try:
        dati = json.loads(f.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        return None, f"{f.name} non si legge: {e.__class__.__name__}"
    analitica = dati.get("analytics")
    if not isinstance(analitica, dict) or "cloudflare_token" not in analitica:
        return None, "sitio.json non ha analytics.cloudflare_token (vuoto se il conteggio è spento)"
    token = analitica["cloudflare_token"]
    if not isinstance(token, str) or (token and not TOKEN_RE.match(token)):
        return None, "analytics.cloudflare_token non è vuoto né 32 caratteri esadecimali"
    return token, None


def pagine_html(radice):
    return sorted((radice / "web").rglob("*.html"))


def allinea(radice, token):
    """Scrive in web/ quello che dice il token. Ritorna la lista dei file cambiati."""
    cambiati = []
    for p in pagine_html(radice):
        testo = p.read_text(encoding="utf-8")
        nuovo, n = META_CSP_RE.subn(
            lambda _m: f'<meta http-equiv="Content-Security-Policy" content="{csp(token)}">', testo, count=1)
        if n != 1:
            raise SystemExit(f"ERRORE  {p.relative_to(radice)}: manca la CSP in <meta>")
        nuovo = BLOCCO_RE.sub("", nuovo)
        if token:
            m = HEAD_FIN_RE.search(nuovo)
            if not m:
                raise SystemExit(f"ERRORE  {p.relative_to(radice)}: manca </head>")
            nuovo = nuovo[:m.start()] + blocco_beacon(token) + nuovo[m.start():]
        if nuovo != testo:
            p.write_text(nuovo, encoding="utf-8")
            cambiati.append(str(p.relative_to(radice)))

    priv = radice / "web" / PRIVACIDAD
    if not priv.exists():
        raise SystemExit(f"ERRORE  manca web/{PRIVACIDAD}")
    testo = priv.read_text(encoding="utf-8")
    for nome in PARAGRAFI_OFF:
        scelto = PARAGRAFI_ON[nome] if token else PARAGRAFI_OFF[nome]
        if not marcatore(nome).search(testo):
            raise SystemExit(f"ERRORE  web/{PRIVACIDAD}: manca il marcatore analitica:{nome}")
        testo = marcatore(nome).sub(
            lambda m, nome=nome, scelto=scelto: f"<!--analitica:{nome}-->{cuerpo(scelto)}<!--/analitica:{nome}-->",
            testo, count=1)
    if testo != priv.read_text(encoding="utf-8"):
        priv.write_text(testo, encoding="utf-8")
        cambiati.append(f"web/{PRIVACIDAD}")
    return cambiati


class _Raccolta(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.csp = []
        self.script = []

    def handle_starttag(self, tag, attrs):
        a = {k.lower(): (v or "") for k, v in attrs}
        if tag == "meta" and a.get("http-equiv", "").lower() == "content-security-policy":
            self.csp.append(a.get("content", ""))
        if tag == "script":
            self.script.append(a)


def controlla(radice, token):
    """Le regole, senza scrivere. Ritorna la lista dei problemi (stringhe, con il nome del file)."""
    problemi = []
    web = radice / "web"
    atteso_csp = csp(token)

    for p in pagine_html(radice):
        rel = str(p.relative_to(radice))
        testo = p.read_text(encoding="utf-8")
        r = _Raccolta()
        r.feed(testo)
        if len(r.csp) != 1:
            problemi.append(f"{rel}: deve avere una sola CSP in <meta>, ne ha {len(r.csp)}")
        elif r.csp[0] != atteso_csp:
            problemi.append(f"{rel}: la CSP non è quella che dice il token")
        beacon = [a for a in r.script if "cloudflareinsights" in a.get("src", "").lower()]
        if token:
            if len(beacon) != 1:
                problemi.append(f"{rel}: lo script di Cloudflare deve esserci una volta, ce ne sono {len(beacon)}")
            else:
                b = beacon[0]
                if b.get("src") != BEACON_SRC:
                    problemi.append(f"{rel}: lo script non punta a {BEACON_SRC}")
                if "defer" not in b:
                    problemi.append(f"{rel}: lo script non ha defer")
                try:
                    dato = json.loads(b.get("data-cf-beacon", ""))
                except json.JSONDecodeError:
                    dato = None
                if not isinstance(dato, dict) or dato.get("token") != token:
                    problemi.append(f"{rel}: data-cf-beacon non porta il token di sitio.json")
        else:
            if beacon:
                problemi.append(f"{rel}: token vuoto ma la pagina ha lo script di Cloudflare")
            if "cloudflareinsights" in testo.lower():
                problemi.append(f"{rel}: token vuoto ma l'html nomina cloudflareinsights")

    if not token:
        for f in sorted(web.rglob("*")):
            if f.is_file() and b"cloudflareinsights" in f.read_bytes():
                problemi.append(f"{f.relative_to(radice)}: token vuoto ma il file nomina cloudflareinsights")

    priv = web / PRIVACIDAD
    if not priv.exists():
        problemi.append(f"web/{PRIVACIDAD} manca")
        return problemi
    testo = priv.read_text(encoding="utf-8")
    for nome in PARAGRAFI_OFF:
        m = marcatore(nome).search(testo)
        if not m:
            problemi.append(f"web/{PRIVACIDAD}: manca il marcatore analitica:{nome}")
            continue
        atteso = PARAGRAFI_ON[nome] if token else PARAGRAFI_OFF[nome]
        if m.group("corpo") != cuerpo(atteso):
            problemi.append(f"web/{PRIVACIDAD}: il blocco {nome} non dice quello che dice il token")
    if token and SERVIZIO not in testo:
        problemi.append(f"web/{PRIVACIDAD} non cita {SERVIZIO} e il token è pieno")
    if not token and SERVIZIO in testo:
        problemi.append(f"web/{PRIVACIDAD} cita {SERVIZIO} e il token è vuoto")
    return problemi


def main(argv):
    ap = argparse.ArgumentParser(description="Accende o spegne il conteggio delle visite da sitio.json.")
    ap.add_argument("--radice", type=Path, default=RAIZ, help="cartella con sitio.json e web/ (default: la repo)")
    gruppo = ap.add_mutually_exclusive_group()
    gruppo.add_argument("--stato", action="store_true", help="stampa pieno oppure vuoto")
    gruppo.add_argument("--controlla", action="store_true", help="non scrive: verifica che web/ dica quello che dice il token")
    a = ap.parse_args(argv)
    radice = a.radice.resolve()

    token, errore = leggi_token(radice)
    if errore:
        print(f"ERRORE  {errore}")
        return 2

    if a.stato:
        print("pieno" if token else "vuoto")
        return 0

    if a.controlla:
        problemi = controlla(radice, token)
        stato = "pieno" if token else "vuoto"
        if problemi:
            print(f"analitica: token {stato}, {len(problemi)} problemi")
            for p in problemi[:40]:
                print(f"  {p}")
            return 1
        print(f"analitica: token {stato}, sitio.json, script, CSP e privacidad dicono la stessa cosa")
        return 0

    cambiati = allinea(radice, token)
    stato = "pieno" if token else "vuoto"
    if cambiati:
        print(f"analitica: token {stato}, allineati {len(cambiati)} file:")
        for c in cambiati:
            print(f"  {c}")
    else:
        print(f"analitica: token {stato}, web/ era già allineato")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
