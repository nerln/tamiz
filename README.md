# Tamiz

**Ayudas y becas que te pueden corresponder.** Tamiz es un sitio estático que, a partir de un
cuestionario que completas en tu navegador, te dice para cada ayuda del catálogo si
«Parece que encajas», si «Te falta un dato» o si «No encaja», con el motivo, el plazo y a
quién acudir para que te ayuden. Por ahora cubre la Comunitat Valenciana, además de las ayudas
estatales y de la Unión Europea que se aplican allí.

El motor de reglas corre en el navegador. **Tus respuestas no se envían a ningún sitio**: el
sitio no usa cookies ni almacenamiento del navegador. El único tercero que puede recibir datos de
visitas es el recuento de Cloudflare Web Analytics, cuando el token de `sitio.json` está lleno; no
ve tus respuestas.

> **Aviso.** Las fichas del catálogo están redactadas con ayuda de una IA y están pendientes de
> revisión humana. La fuente oficial (la convocatoria, la norma o el organismo) siempre prevalece
> sobre lo que diga Tamiz. Tamiz no ofrece asesoramiento jurídico ni financiero.

## Cómo funciona

1. Respondes un cuestionario corto, una pregunta por pantalla, y puedes contestar «no lo sé» en
   cualquier momento.
2. El motor (`web/js/motor.js`) compara tus datos con las reglas de cada ficha y calcula el
   estado: encaja, falta un dato o no encaja.
3. Cada resultado explica las razones, indica la fecha límite cuando la conocemos y, cuando hace
   falta hablar con una persona, indica a quién acudir para que te ayude (sindicatos, ONG, oficinas
   públicas).
4. Si quieres, puedes descargar un calendario (`.ics`) con las fechas límite. El archivo es
   estático y no contiene datos personales.

## Estructura del repositorio

| Carpeta o archivo | Contenido |
|---|---|
| `web/` | El sitio estático que se publica: páginas HTML, CSS, JavaScript y los datos generados (`web/data/`). |
| `catalogo/` | Las fuentes del catálogo: `fichas/` (una ayuda por archivo), `ayuda_humana.json` y `glosario.json`. |
| `schema/` | Los esquemas JSON (`perfil.schema.json`, `catalogo.schema.json`) y los ejemplos inventados en `schema/esempi/`. |
| `scripts/` | Herramientas en Python de la biblioteca estándar, entre ellas `construir.py` (genera el catálogo), `validar.py` (valida esquemas, fichas y perfiles) y `analytics.py` (enciende o apaga el recuento de visitas según el token de `sitio.json`). |
| `tests/` | Pruebas del motor de reglas (`motor.test.mjs`), con perfiles inventados. |
| `docs/` | Documentación del esquema: `ESQUEMA.md` describe el esquema v1.1 campo por campo y el contrato de la función `evaluar()`. |
| `sitio.json` | Nombre, lema y dirección del sitio, y el token de Cloudflare Web Analytics (`analytics.cloudflare_token`; vacío = sin recuento). Es la única fuente de esos datos. |

## Cómo se construye y se prueba en local

Requisitos: Python 3 y Node.js (las pruebas se han hecho con Node 22). Desde la raíz del repositorio:

```sh
# validar esquemas, fichas y perfiles de ejemplo (usa jsonschema si está instalado)
python3 scripts/validar.py

# opcional: un entorno con jsonschema, para validar con el validador completo
python3 -m venv .venv
.venv/bin/pip install jsonschema
.venv/bin/python scripts/validar.py

# construir el catálogo a partir de catalogo/ (escribe web/data/catalogo.json)
python3 scripts/construir.py

# construir un catálogo de ejemplo a partir de schema/esempi/
python3 scripts/construir.py --ejemplo

# pruebas del motor de reglas
node --test

# ver el sitio en local
python3 -m http.server 8000 --directory web
```

Después abre `http://localhost:8000/` en el navegador.

`construir.py` deja fuera de la publicación las fichas que no están marcadas como `"alta"`, que
no tienen la fecha de lectura (`leido_por_agente`) o que tienen el campo `_revisar`. Con
`--estricto`, una sola ficha excluida detiene la construcción. Los códigos de salida son 0 si
todo está bien y 1 si hay errores; cada error indica el archivo, el `id` de la ficha y el campo.

## Cómo añadir una ayuda

1. Crea un archivo nuevo en `catalogo/fichas/`, con un único objeto JSON que siga el esquema
   descrito en [`docs/ESQUEMA.md`](docs/ESQUEMA.md). El `id` es único y solo contiene
   minúsculas, cifras y guiones (por ejemplo `es-vc-carnet-jove`).
2. Escribe en `fuente` la URL oficial de la convocatoria o de la norma, y en `plazo` la fecha
   solo si la has leído en el texto oficial.
3. Marca `confianza` como `"alta"` solo cuando las reglas coinciden con la fuente, y añade
   `leido_por_agente` con la fecha en que la leíste.
4. Ejecuta `python3 scripts/validar.py catalogo/fichas` y después `python3 scripts/construir.py`,
   y por último `node --test`.

Si una ficha todavía no está lista, guárdala con el sufijo `-candidata.json`: el build la deja
fuera. Los textos no pueden decir que la persona cumple un requisito, que le toca una ayuda ni
que tiene derecho a ella: `validar.py` rechaza esas expresiones. El sitio solo informa de si la
situación encaja, si falta un dato o si no encaja.

## Licencias

- El código (`web/js/`, `scripts/`, `tests/`, `schema/`) se publica con licencia **MIT**. Ver
  [`LICENSE`](LICENSE).
- El catálogo (`catalogo/` y `web/data/`: fichas, textos de ayuda y glosario) se publica con
  licencia **CC BY 4.0**. Ver [`LICENSE-CATALOGO`](LICENSE-CATALOGO).
- Los datos públicos de origen (convocatorias, plazos y requisitos) siguen sujetos a las
  condiciones de reutilización del BOE y de la BDNS.

---

## English summary

Tamiz is a static website that tells you which Spanish public aid and grants you may be eligible
for. For now it covers the Valencian Community and the state and EU aid that applies there. You
answer a short questionnaire in the browser; the rules engine (`web/js/motor.js`) runs locally and
sends nothing anywhere. Each aid is marked "Parece que encajas", "Te falta un dato" or "No encaja",
with the reason and deadline when known.

The catalogue cards are drafted with AI and are awaiting human review. The official source always
prevails. The code is MIT-licensed and the catalogue is CC BY 4.0.

Build and test locally: `python3 scripts/construir.py`, `node --test`, and
`python3 -m http.server 8000 --directory web`. Python needs only the standard library; `jsonschema`
is optional for `scripts/validar.py`. Add an aid by creating a single JSON file in
`catalogo/fichas/` that follows `docs/ESQUEMA.md`.
