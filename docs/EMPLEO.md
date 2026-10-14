# Ofertas de empleo: fuentes, plazos y cómo se regenera

Este documento describe la sección «Ofertas de empleo» del sitio (`web/empleo.html`). Los datos
llegan desde `web/data/empleo.json`, que `scripts/empleo.py` escribe al generar el sitio. Las
fuentes y sus condiciones de uso son las que se leyeron el 14/10/2026; cuando un término no se
ha leído, se dice aquí.

## Principio

Las ofertas son **oportunidades de terceros, no derechos ni ayudas**. Están en una página aparte,
sin «Parece que encajas», con un aviso fijo: «Ofertas de terceros, sin verificar: no son ayudas ni
derechos. Tamiz no recibe nada de ti al abrirlas.»

El sitio no pide datos a terceros desde el navegador: `empleo.json` es un fichero estático
escrito al generar el sitio. La página no carga fuentes ni imágenes externas, y no carga scripts
externos salvo el recuento de visitas de Cloudflare Web Analytics, cuando el token de `sitio.json`
está lleno (la CSP sigue siendo `'self'`, con los dos hosts de ese recuento). Los enlaces a las ofertas y a las fuentes son navegación con
`target="_blank"` y `rel="noopener noreferrer"`.

## Fuentes

| Fuente | Activada | Acceso | Qué se toma | Condiciones de reutilización (leídas) | Atribución mostrada |
|---|---|---|---|---|---|
| **Arbeitnow** (`/api/job-board-api`) | siempre | JSON sin clave, 3 páginas de 300 | solo `remote: true` o ubicación en España | enlace de vuelta a arbeitnow.com obligatorio; «please do not abuse» | «Ofertas de Arbeitnow (arbeitnow.com), con enlace de vuelta a la fuente.» |
| **Remotive** (`/api/remote-jobs`) | siempre | JSON, **una sola petición** cada 24 horas (ver abajo) | categorías *Software Development*, *Data and Analytics*, *Artificial Intelligence*; `candidate_required_location` que contiene Worldwide, Europe o Spain | enlace a la URL de Remotive **y** nombre de Remotive; ofertas con 24 horas de retraso; máximo 4 peticiones al día; prohibido recoger inscripciones o correos y republicar en Jooble, Google Jobs o LinkedIn Jobs | «Ofertas de Remotive (remotive.com), con un retraso de 24 horas.» |
| **BOE** (sumario, `/datosabiertos/api/boe/sumario/AAAAMMGG`) | siempre | JSON oficial, sin clave | sección **2B** Oposiciones y concursos del día y de los 2 días laborables anteriores | reutilización también comercial; fuente obligatoria; no «desnaturalizar el sentido» | «Fuente de los datos: Agencia Estatal Boletín Oficial del Estado» (texto oficial) |
| **EURES** (endpoint de búsqueda del portal) | **no**, solo con `--eures` | POST sin clave, endpoint no documentado | filtro `es52`, después `ES521`, `ES522`, `ES523` por nuestra parte | aviso legal de ELA: reutilización autorizada «provided that ELA is acknowledged as the source» | «Fuente: EURES (European Labour Authority).» |

No incluidas en la generación, solo enlaces en la página: **Empléate** (SEPE), **Punt LABORA** y
**EURAXESS**. Excluidas: Indeed, LinkedIn e InfoJobs (condiciones que prohíben agregar o llevar
candidatos fuera). Pendientes: Adzuna (necesita una clave del usuario), Jooble y We Work Remotely
(condiciones no leídas).

## Por qué EURES está apagado por defecto

EURES es la fuente con más volumen (la Comunitat Valenciana tiene unas 1.400 ofertas en una
semana), pero:

- no tiene documentación oficial de la API: la única descripción es un proyecto no oficial, y el
  endpoint puede cambiar sin aviso;
- la respuesta no tiene CORS, así que no se podría usar desde el navegador: se descarga al generar
  el sitio;
- las descripciones contienen direcciones de correo de empresas: por eso el script **nunca guarda la
  descripción**; la lee solo para clasificar la oferta;
- la atribución exigida es ELA, ya prevista en el texto de `FUENTES`.

Para activarlo: `python3 scripts/empleo.py --eures`. Mientras no haya una prueba de que la respuesta
se mantiene estable durante algunas semanas, sigue apagado. En `empleo.json`, EURES aparece solo si
está activo: si está apagado, no aparece en absoluto entre las fuentes.

## Qué se guarda de cada oferta

Solo los campos públicos: **título, empresa, lugar, fecha, enlace, fuente, categoría** y el indicador
`remoto`. Ninguna descripción, ningún salario deducido, ningún correo. Como máximo 150 ofertas en
total, las más recientes. Las ofertas se deduplican por enlace.

Categorías (`categoria`): `investigacion_universidad`, `remoto_europa`, `comunitat_valenciana`,
`empleo_publico`. La asignación sigue reglas sencillas sobre el texto (ver `scripts/empleo.py`).

## Reglas que aplica el script (deducidas; hay que verificarlas cada vez que cambien las fuentes)

- Una petición cada vez, con al menos 1 segundo entre el inicio de una y la siguiente; tiempo máximo
  de espera 20 s.
- Una fuente que falla (red, HTTP, formato, ningún sumario en 3 días) queda con `estado: "error"` y
  el `motivo`; el script sigue con las demás y escribe el mismo fichero. Sale con 0 aunque todas las
  fuentes estén en error; sale con 1 solo si no puede escribir.
- Si **ninguna fuente** se lee con éxito en esta generación (la reutilización de Remotive no cuenta) y
  `web/data/empleo.json` ya existe, el fichero **no se toca**: el script escribe en la salida el aviso «Nessuna fonte letta con successo in questa build» (es el texto real de la salida del script) y sale con 0. Así, una generación con todas las fuentes caídas no borra las ofertas
  buenas. Si el fichero no existe, se escribe igualmente (con los errores en las fuentes). Con una sola
  fuente correcta, el fichero se escribe. La página muestra la antigüedad de los datos: si el fichero
  tiene más de 3 días, lo indica en rojo.
- Un error a mitad de una fuente no tira las ofertas ya leídas: la fuente queda como `error`, con `n`
  igual al número de ofertas leídas antes del error. La página escribe «Lectura incompleta» cuando `n`
  es mayor que cero, y «No disponible» cuando es cero.
- Remotive: la medida es la **fecha de lectura**, `fuentes[Remotive].leido_el` (ISO con zona horaria),
  escrita solo cuando Remotive se lee de verdad. Si la generación anterior leyó Remotive con éxito hace
  menos de 24 horas, el script reutiliza sus ofertas sin una petición nueva; la nota de la ficha indica
  la fecha de lectura («Ofertas leídas el dd/mm a las HH:MM»), no la de la generación, y la reutilización
  copia `leido_el` sin adelantarlo. Un fichero sin `leido_el` (formato anterior) cuenta como «para volver
  a leer». En otro caso, hace una sola petición.
  **La reutilización lee el fichero `web/data/empleo.json` que encuentra en la carpeta**: en un flujo de
  Pages ese fichero es el que está en el repositorio, así que la reutilización sirve en las generaciones
  locales y no protege de varias ejecuciones en CI. Por eso el límite debe respetarse con el disparador
  programado (ver abajo).
- BOE: además de los actos de trámite, se excluyen las correcciones de un acto anterior («se corrigen
  errores», «corrección de errores») y los avisos de fecha y lugar del primer ejercicio («fecha, hora y
  lugar», «celebración del primer ejercicio»), que no son ofertas. Los títulos del BOE llegan hasta 600
  caracteres: se recortan con «…» solo por encima de ese límite.
- En el BOE, los días sin sumario (domingos, festivos) con 404 se saltan. Si los tres días dan 404, la
  fuente está en error: es un cambio del endpoint, no un día sin publicaciones.
- En el BOE se excluyen los actos de trámite, es decir, los resultados sin plazas: listas de admitidos y
  excluidos («relación definitiva», «lista de…»), calificaciones, correcciones, la composición o el
  nombramiento de un tribunal («nombramiento de tribunal», «composición del tribunal», «se nombra / se
  nombran»), y las adjudicaciones de destinos («adjudicación de destinos»). Ya no se excluyen por una
  sola palabra como «tribunal», «nombr» o «adjudic»: así quedan las convocatorias reales (por ejemplo,
  una plaza de Letrado del Gabinete Técnico del Tribunal Supremo, o una convocatoria con «nombrando a un
  asesor»).
- Clasificación valenciana: «Valencia», «València», «Alicante», «Castellón» y «Castelló de la Plana» son
  la Comunitat Valenciana. «Valencia de Don Juan» (León), «Valencia de Alcántara» (Cáceres), «Castelló
  d'Empúries» y «Castello de Farfanya» no.
- Arbeitnow: las ofertas españolas que no son ni valencianas ni de investigación no tienen categoría en
  la lista, y se descartan.
- Escritura atómica: el script escribe `empleo.json.tmp` y después lo sustituye.
- Límite por sección: la página muestra como máximo 10 ofertas por categoría; el botón «Ver más
  (N restantes)» añade más, el foco va a la primera añadida, y un cambio de búsqueda o de categoría
  devuelve cada sección a 10. El contador «Mostrando N de M» y el (n) del título siguen refiriéndose al
  total filtrado.
- Nombre del sitio: la página lee `sitio.nombre` de `data/catalogo.json` (escrito al generar el sitio
  desde `sitio.json`). Si el fichero falta, queda «Tamiz», sin errores en la consola.
- Error de carga: si `empleo.json` no se puede leer, la página muestra solo el mensaje de error: los
  filtros, el contador y la sección «Fuentes» quedan ocultos.
- Textos para el usuario: el límite de 4 peticiones diarias de Remotive y su nota interna no aparecen en
  la página; quedan en este documento y en el docstring del script. La atribución «con un retraso de 24
  horas», en cambio, la exigen las condiciones de Remotive y se mantiene.

## Cómo se regenera

Desde la raíz del repositorio:

```sh
python3 scripts/empleo.py            # Arbeitnow, Remotive, BOE
python3 scripts/empleo.py --eures    # también EURES
python3 scripts/empleo.py --salida /ruta/prueba.json   # escribe en otro sitio, para las pruebas
```

Pruebas de fallo sin tocar el fichero real: las variables `TAMIZ_EMPLEO_ARBEITNOW`,
`TAMIZ_EMPLEO_REMOTIVE`, `TAMIZ_EMPLEO_BOE` y `TAMIZ_EMPLEO_EURES` sustituyen la URL base de cada
fuente. Una URL incorrecta da `estado: "error"` en esa fuente y nada más.

La página se ve con un servidor estático dentro de `web/`:

```sh
python3 -m http.server 8000 --directory web
```

## Paso que hay que añadir al flujo de Pages

El flujo de publicación (`.github/workflows/pages.yml`) incluye este paso. Debe ir **antes** de subir
la carpeta `web/` como artefacto:

```yaml
- name: Ofertas de empleo (al generar)
  run: python3 scripts/empleo.py
```

El flujo usa solo la biblioteca estándar de Python: no hace falta instalar nada. Si una fuente está
caída, la generación continúa y la página indica qué fuente no ha respondido.

El paso debe ejecutarse con un **disparador programado** (por ejemplo `schedule` una vez al día, más
`workflow_dispatch` para las pruebas manuales), **no en cada envío**: en cada envío, Remotive se
consultaría más de 4 veces al día, que es el límite del sitio.

## Cosas que vigilar

- `generado_el` es la fecha de la publicación. La página la muestra en rojo si tiene más de 3 días:
  si el flujo no se ejecuta, se nota.
- Remotive pide no superar 4 peticiones al día: el script hace como máximo una cada 24 horas (ver
  arriba), y el flujo debe programarse, no lanzarse en cada envío. Remotive devuelve solo las primeras
  100 ofertas (`limit=100`) y el filtro por categorías trabaja sobre ellas: si hay más, algunas ofertas
  de software, datos o IA quedan fuera.
- Si Arbeitnow cambia la forma del JSON, el analizador lanza un error y la fuente pasa a `error`: el
  proceso no se rompe, y se conservan las ofertas leídas antes del error. Revisarlo después de cada
  cambio en el sitio de la fuente.
- El fichero `web/data/empleo.json` se versiona como instantánea: cada generación lo sobrescribe.

## Pendientes

- **Arbeitnow, España fuera de Valencia y de investigación.** Las ofertas españolas no remotas que no son
  ni valencianas ni de investigación se descartan, porque ninguna de las cuatro categorías las cubre
  (empleo público no es correcto para una empresa privada). No se ha medido cuántas son en esta
  generación. Por decidir: añadir una categoría, o una etiqueta «España».
- **Empresa en el BOE.** El campo «empresa» es el departamento del sumario («ADMINISTRACIÓN LOCAL»,
  «UNIVERSIDADES»), no el organismo. Es poco útil. Extraer el organismo del título es frágil: por ahora
  se queda el departamento.
- **Fichero versionado.** `web/data/empleo.json` contiene 129 ofertas de terceros leídas el 14/10 a las
  05:12, regeneradas tras las correcciones con las fuentes reales. La carpeta `web/` forma parte de la
  publicación: falta decidir si conviene versionar las ofertas o generar el fichero al publicar y
  versionar uno vacío.
- **Remotive, primeras 100 ofertas.** Si se quieren cubrir todas las categorías, hace falta una petición
  por categoría, y entonces el límite de 4 al día debe revisarse.
