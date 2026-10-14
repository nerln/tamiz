#!/usr/bin/env python3
"""Cloudflare Web Analytics: il conteggio delle visite si accende o si spegne da sitio.json.

Il token sta in sitio.json, campo analytics.cloudflare_token: 32 caratteri esadecimali, oppure
vuoto. Con il token pieno:
  - ogni HTML di web/ ha lo script di Cloudflare una volta sola, con defer e data-cf-beacon
    col token;
  - la CSP di ogni HTML ammette i due host di Cloudflare: static.cloudflareinsights.com in
    script-src e cloudflareinsights.com in connect-src. Il resto resta 'self';
  - privacidad.html descrive il conteggio (apartado 8) e cambia i paragrafi 2, 3, 4 e 5 che
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
    "resumen": "<p><strong>En resumen:</strong> tus respuestas se quedan en tu dispositivo. Tamiz no recoge datos personales.</p>",
    "finalidad": "<p>Las respuestas al cuestionario y tu perfil se procesan solo en tu dispositivo, con la única finalidad de mostrarte los resultados. No se envían a ningún servidor.</p>",
    "cookies": "<p>Tamiz no usa cookies, analítica ni publicidad, y no carga tipografías, scripts, vídeos ni contenidos de otras webs.</p>",
    "destinatarios": "<p>El sitio está alojado en GitHub Pages (GitHub, Inc.), que recibe tu dirección IP y los datos técnicos de cada solicitud para servir las páginas y los trata como responsable, conforme a su <a href=\"https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement\">declaración de privacidad</a>. No hay otros destinatarios.</p>",
    "transferencias": "<p>GitHub, Inc. trata los datos en Estados Unidos, al amparo del Marco de Privacidad de Datos UE-EE. UU., al que está adherida.</p>",
    "conservacion": "<p>Tamiz no guarda datos personales. Lo que introduces se queda en tu dispositivo hasta que pulses «Borrar todo» o cierres la página. GitHub conserva los datos técnicos según su declaración de privacidad.</p>",
    "visitas": None,
}
PARAGRAFI_ON = {
    "resumen": "<p><strong>En resumen:</strong> tus respuestas se quedan en tu dispositivo. Solo se cuentan las visitas, sin cookies y en cifras agregadas.</p>",
    "finalidad": "<p>Las respuestas al cuestionario y tu perfil se procesan solo en tu dispositivo, con la única finalidad de mostrarte los resultados. No se envían a ningún servidor. Aparte, se cuentan las visitas a las páginas con Cloudflare Web Analytics (apartado 8).</p>",
    "cookies": "<p>Tamiz no usa cookies ni publicidad, y no carga tipografías, vídeos ni contenidos de otras webs. El único script externo es el del recuento de visitas (apartado 8), que no usa cookies.</p>",
    "destinatarios": "<p>El sitio está alojado en GitHub Pages (GitHub, Inc.), que recibe tu dirección IP y los datos técnicos de cada solicitud para servir las páginas y los trata como responsable, conforme a su <a href=\"https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement\">declaración de privacidad</a>. Cloudflare, Inc. recibe tu dirección IP y la dirección de la página para el recuento de visitas (apartado 8). No hay otros destinatarios.</p>",
    "transferencias": "<p>GitHub, Inc. y Cloudflare, Inc. tratan los datos en Estados Unidos, al amparo del Marco de Privacidad de Datos UE-EE. UU., al que ambas están adheridas.</p>",
    "conservacion": "<p>Tamiz no guarda datos personales. Lo que introduces se queda en tu dispositivo hasta que pulses «Borrar todo» o cierres la página. GitHub conserva los datos técnicos según su declaración de privacidad, y Cloudflare los del recuento según el apartado 8.</p>",
    "visitas": (
        "<h2>8. Recuento de visitas</h2>\n"
        "    <p>Tamiz cuenta las visitas con Cloudflare Web Analytics. Al cargar una página, un script de Cloudflare envía la dirección de la página, la página de procedencia, el tipo de navegador y los tiempos de carga; Cloudflare recibe además tu dirección IP, de la que deduce el país. Tus respuestas nunca forman parte de la dirección de la página, así que no llegan a Cloudflare.</p>\n"
        "    <p>Según Cloudflare, el script no usa cookies, no guarda nada en tu dispositivo y no crea perfiles. Tamiz solo ve cifras agregadas. Cloudflare conserva los datos detallados 7 días y los agregados hasta 6 meses, conforme a su <a href=\"https://www.cloudflare.com/privacypolicy/\" rel=\"noopener\">política de privacidad</a>.</p>\n"
        "    <p>Base jurídica: interés legítimo del titular en saber qué páginas se consultan, para mejorar el servicio.</p>"
    ),
}

# Stesse voci in inglese, per web/en/privacidad.html (lotto L37). Stessa regola: il token decide.
PARAGRAFI_OFF_EN = {
    'resumen': (
        '<p><strong>In short:</strong> your answers stay on your device. Tamiz does not collect personal data.</p>'
    ),
    'finalidad': (
        '<p>Answers to the questionnaire and your profile are processed only on your device, for the sole purpose of showing you the results. They are not sent to any server.</p>'
    ),
    'cookies': (
        '<p>Tamiz does not use cookies, analytics or advertising, and does not load fonts, scripts, videos or content from other websites.</p>'
    ),
    'destinatarios': (
        '<p>The site is hosted on GitHub Pages (GitHub, Inc.), which receives your IP address and the technical data of each request in order to serve the pages, and processes it as controller, in accordance with its <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">privacy statement</a>. There are no other recipients.</p>'
    ),
    'transferencias': (
        '<p>GitHub, Inc. processes data in the United States, under the EU-US Data Privacy Framework, which it has joined.</p>'
    ),
    'conservacion': (
        '<p>Tamiz does not keep personal data. What you enter stays on your device until you press “Delete everything” or close the page. GitHub keeps technical data according to its privacy statement.</p>'
    ),
    'visitas': None,
}
PARAGRAFI_ON_EN = {
    'resumen': (
        '<p><strong>In short:</strong> your answers stay on your device. Only visits are counted, without cookies and in aggregate figures.</p>'
    ),
    'finalidad': (
        '<p>Answers to the questionnaire and your profile are processed only on your device, for the sole purpose of showing you the results. They are not sent to any server. Separately, visits to the pages are counted with Cloudflare Web Analytics (section 8).</p>'
    ),
    'cookies': (
        '<p>Tamiz does not use cookies or advertising, and does not load fonts, videos or content from other websites. The only external script is the one that counts visits (section 8), which does not use cookies.</p>'
    ),
    'destinatarios': (
        '<p>The site is hosted on GitHub Pages (GitHub, Inc.), which receives your IP address and the technical data of each request in order to serve the pages, and processes it as controller, in accordance with its <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">privacy statement</a>. Cloudflare, Inc. receives your IP address and the address of the page for the visit count (section 8). There are no other recipients.</p>'
    ),
    'transferencias': (
        '<p>GitHub, Inc. and Cloudflare, Inc. process data in the United States, under the EU-US Data Privacy Framework, which both have joined.</p>'
    ),
    'conservacion': (
        '<p>Tamiz does not keep personal data. What you enter stays on your device until you press “Delete everything” or close the page. GitHub keeps technical data according to its privacy statement, and Cloudflare keeps the visit-count data according to section 8.</p>'
    ),
    'visitas': (
        '<h2>8. Visit count</h2>\n    <p>Tamiz counts visits with Cloudflare Web Analytics. When a page loads, a Cloudflare script sends the page address, the referring page, the browser type and the loading times; Cloudflare also receives your IP address, from which it deduces the country. Your answers are never part of the page address, so they do not reach Cloudflare.</p>\n    <p>According to Cloudflare, the script does not use cookies, does not store anything on your device and does not create profiles. Tamiz only sees aggregate figures. Cloudflare keeps the detailed data for 7 days and the aggregate data for up to 6 months, in accordance with its <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener">privacy policy</a>.</p>\n    <p>Legal basis: the owner\'s legitimate interest in knowing which pages are consulted, in order to improve the service.</p>'
    ),
}
# (file, testi spenti, testi accesi) di ogni privacidad.html che il conteggio aggiorna.
PRIVACIDAD_PAGINE = [
    (PRIVACIDAD, PARAGRAFI_OFF, PARAGRAFI_ON),
    ("en/" + PRIVACIDAD, PARAGRAFI_OFF_EN, PARAGRAFI_ON_EN),
]


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

    for rel_priv, off, on in PRIVACIDAD_PAGINE:
        priv = radice / "web" / rel_priv
        if not priv.exists():
            raise SystemExit(f"ERRORE  manca web/{rel_priv}")
        testo = priv.read_text(encoding="utf-8")
        for nome in off:
            scelto = on[nome] if token else off[nome]
            if not marcatore(nome).search(testo):
                raise SystemExit(f"ERRORE  web/{rel_priv}: manca il marcatore analitica:{nome}")
            testo = marcatore(nome).sub(
                lambda m, nome=nome, scelto=scelto: f"<!--analitica:{nome}-->{cuerpo(scelto)}<!--/analitica:{nome}-->",
                testo, count=1)
        if testo != priv.read_text(encoding="utf-8"):
            priv.write_text(testo, encoding="utf-8")
            cambiati.append(f"web/{rel_priv}")
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

    for rel_priv, off, on in PRIVACIDAD_PAGINE:
        priv = web / rel_priv
        if not priv.exists():
            problemi.append(f"web/{rel_priv} manca")
            continue
        testo = priv.read_text(encoding="utf-8")
        for nome in off:
            m = marcatore(nome).search(testo)
            if not m:
                problemi.append(f"web/{rel_priv}: manca il marcatore analitica:{nome}")
                continue
            atteso = on[nome] if token else off[nome]
            if m.group("corpo") != cuerpo(atteso):
                problemi.append(f"web/{rel_priv}: il blocco {nome} non dice quello che dice il token")
        if token and SERVIZIO not in testo:
            problemi.append(f"web/{rel_priv} non cita {SERVIZIO} e il token è pieno")
        if not token and SERVIZIO in testo:
            problemi.append(f"web/{rel_priv} cita {SERVIZIO} e il token è vuoto")
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
