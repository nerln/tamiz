# Esquema v1.1 di Tamiz (congelato il 14/10/2026)

Questo file è la base comune di tre lavori che partono in parallelo: le schede del catalogo,
il motore che le valuta e l'interfaccia che fa le domande. Tutti e tre leggono **solo
questo file** e i due JSON Schema in `schema/`. Se qualcosa qui non basta per decidere, la
risposta non si inventa: si chiede al coordinatore.

- `schema/perfil.schema.json`: il profilo della persona (`perfil.json`).
- `schema/catalogo.schema.json`: il catalogo; una scheda sola si valida contro
  `#/$defs/ficha`.
- `schema/esempi/perfil-lucia.json` e `perfil-rodrigo.json`: due persone **inventate**.
- `schema/esempi/fichas/` (tre schede), `schema/esempi/ayuda_humana.json`,
  `schema/esempi/glosario.json`: il materiale del catalogo segnaposto
  (`scripts/construir.py --ejemplo` → `web/data/catalogo.json`), §9.
- `scripts/validar.py` e `scripts/construir.py`: i controlli di §7.

Il nome del sito («Tamiz», nome di lavoro proposto: la decisione è dell'utente) vive in un
posto solo, `sitio.json`, che `construir.py` copia in `catalogo.sitio` (§4.1, §6.8). Nessun
altro file dell'interfaccia scrive il nome.

La funzione del motore che l'interfaccia chiama è descritta nella sezione **«Contrato de
evaluar()»** (dopo §5): è l'unica cosa che il motore (L1) e l'interfaccia (L2) devono
condividere.

Lingua: questo documento è in italiano; codici, etichette e testi che vede l'utente sono in
spagnolo. I codici (`residencia_larga_duracion`) non si mostrano mai: l'interfaccia mostra
sempre l'etichetta della tabella in §2.4.

Regola di modifica: lo schema v1.1 non si tocca a mano. Un cambiamento fa nascere una nuova
versione con il suo convertitore (§8 è il modello), e i due JSON Schema cambiano insieme a
questo file.

---

## 0. Cosa cambia da v1 a v1.1

| dove | v1 | v1.1 |
|---|---|---|
| nomi | `esquema` v1 (nome del sito precedente), `version: 1`, `$id` sul dominio precedente | `tamiz-perfil`, `tamiz-catalogo`, `version: 1.1`, `$id` su `nerln.github.io/tamiz/` |
| profilo | `situacion_administrativa.tipo` aveva un'opzione per chi è senza documento in vigore | tolta: chi non si riconosce lascia il campo vuoto e ottiene «Te falta un dato» con il rinvio a una ONG (§2.4) |
| profilo | campo di salute riservato e vietato con `not: {}` | non esiste più nello schema: lo rifiuta `additionalProperties: false` (§2.6) |
| scheda | `verificado_el` obbligatorio, data della verifica di «qualcuno» | `verificado_el` data **o `null`**, e vuol dire «rivista da una persona» |
| scheda | — | `leido_por_agente` (data, obbligatorio): giorno in cui un agente IA ha letto la fonte |
| scheda | — | `solicita`: chi presenta la domanda (`persona` se manca) |
| scheda | `revisar_antes_de` calcolato da `verificado_el` | calcolato da `leido_por_agente`, e deve essere **dopo** `leido_por_agente` |
| scheda | `plazo.verificado` | `true` solo con `plazo.fuente` (lo schema lo impone) |
| ayuda_humana | `verificado_el` data | data o `null` |
| catalogo | — | `redactado_con_ia`, `revision_humana` obbligatori; `sitio` (lo scrive `construir.py`) |
| motore | `evaluar(perfil, ficha, grupos_paises, hoy)` | `evaluar(catalogo, perfil, hoy)`, sezione «Contrato de evaluar()» |

**Aggiunte dell'ondata universale (14/10/2026, decisione U2 del coordinatore).** Restano nella
versione 1.1 (nessun convertitore: una scheda si aggiorna aggiungendo `area`):

| dove | prima | dopo |
|---|---|---|
| scheda | — | `area` (obbligatorio, enum di 12 aree, §4.2) |
| scheda | — | `informativa` (bool, facoltativo, default `false`): la scheda non riceve un esito (§4.2) |
| scheda | `requisitos: []` ammesso («per chiunque») | ammesso **solo** con `informativa: true`; `validar.py` rifiuta il resto (§7) e il motore lo tratta come regola non valida (§5.6) |
| plazo | — | `mes_habitual` (intero 1-12, facoltativo, §4.6) |
| motore | ogni scheda in `fichas` | le informative vanno in `informativas: [{id, area}]`; ogni voce di `fichas` porta `area` |

---

## 1. I principi che decidono tutto il resto

1. **Tre esiti, mai di più.** Ogni regola dà `cumple`, `falta_dato` o `no_cumple`; la
   scheda intera dà lo stesso tipo di esito. Per l'utente: «Parece que encajas», «Te falta
   un dato», «No encaja» (§6.1). I codici interni non arrivano mai sullo schermo.
2. **Un dato che manca non esclude mai.** Campo assente, `"no_lo_se"`, `"otro"`,
   `"prefiero_no_decirlo"`, dato di tipo sbagliato, data impossibile, intervallo che sta a
   cavallo della soglia: sempre `falta_dato`, mai `no_cumple`.
3. **Il dubbio va verso la persona.** Quando una misura del profilo è solo vicina a quella
   delle bases, la regola dichiara quale esito non è conclusivo (`no_concluyente`, §4.4) e
   il motore lo trasforma in `falta_dato`.
4. **Niente salute nella v1.1.** Il profilo non ha nessun campo di salute (§2.6).
5. **Niente nome.** Il profilo non ha campi per nome, cognome, documento, indirizzo,
   telefono o email. Solo i profili d'esempio hanno un `nombre_ficticio`.
6. **Il motore è deterministico.** Stesso profilo, stessa scheda, stessa data di oggi:
   stesso esito. La data di oggi è un parametro (`hoy`), così si prova.

---

## 2. `perfil.json`

### 2.1 Forma

```json
{
  "esquema": "tamiz-perfil",
  "version": 1.1,
  "actualizado_el": "2026-10-14",
  "ejemplo": { "nombre_ficticio": "…", "descripcion": "…", "sintetico": true },
  "persona": { … },
  "residencia": { … },
  "situacion_administrativa": { … },
  "empleo": { … },
  "estudios": { … },
  "hogar": { … },
  "vivienda": { … },
  "ingresos": { … },
  "vinculos": { … },
  "intereses": [ … ],
  "solicitudes": [ … ]
}
```

- Obbligatori solo `esquema` (sempre `"tamiz-perfil"`) e `version` (sempre `1.1`). Tutto
  il resto è facoltativo: un profilo vuoto è valido e dà «Te falta un dato» ovunque.
- Un file **senza `esquema`** è un profilo v0; uno con il nome di esquema della v1 (quello del
  sito precedente) è un profilo v1: vanno passati dal convertitore (§8.1, §8.0).
- Nessun oggetto accetta chiavi che non sono qui (`additionalProperties: false`). `null`
  non è ammesso: un dato non risposto **non si scrive**.
- `ejemplo` esiste solo nei profili d'esempio. L'interfaccia non lo scrive mai in un
  profilo vero e, se carica un file che lo contiene, mostra «Perfil de ejemplo».
- `actualizado_el`: data `AAAA-MM-DD` dell'ultima modifica; la scrive l'interfaccia.

### 2.2 I campi

Ogni foglia, salvo dove detto, accetta anche il valore `"no_lo_se"` (la risposta «No lo
sé» del questionario). Le date «parziali» sono `AAAA`, `AAAA-MM` o `AAAA-MM-DD` (§3.1).

| campo | tipo | significato e note |
|---|---|---|
| `persona.anio_nacimiento` | intero 1900-2100 | anno di nascita. Non si usa nelle regole: si usa `calc.edad` |
| `persona.mes_nacimiento` | intero 1-12 | facoltativo; si chiede solo quando serve (§3.2) |
| `persona.nacionalidades` | lista ISO 3166-1 alfa-2 | nazionalità attuali, tutte. `[]` = apolide |
| `persona.sexo` | enum `sexo` | facoltativo; il questionario lo chiede solo se una scheda pubblicata lo usa |
| `residencia.pais` | ISO 3166-1 alfa-2 | paese in cui vive (`ES`) |
| `residencia.region` | ISO 3166-2 | comunità autonoma (`ES-VC`) |
| `residencia.provincia` | ISO 3166-2 | provincia (`ES-V`) |
| `residencia.municipio` | testo | solo da mostrare; **mai nelle regole** |
| `residencia.municipio_ine` | 5 cifre | codice INE del comune (`46250` = València); è quello che usano le regole |
| `residencia.empadronado_desde` | data parziale | inizio dell'empadronamiento nel comune attuale |
| `situacion_administrativa.tipo` | enum `situacion_administrativa` | il documento che ha in mano, scritto come sulla tarjeta. Chi non si riconosce in nessuna opzione lo lascia **vuoto** (§2.4) |
| `situacion_administrativa.autoriza_trabajar` | booleano | «¿Tu documento te permite trabajar?» |
| `situacion_administrativa.residencia_legal_desde` | data parziale | inizio della residenza legale **continuata** in `residencia.pais`; per chi ha la nazionalità, da quando vive nel paese senza interruzioni |
| `situacion_administrativa.documento_desde` | data parziale | data di concessione del documento attuale |
| `situacion_administrativa.documento_hasta` | data parziale | data di scadenza della tarjeta |
| `empleo.situaciones` | lista enum `empleo_situacion` | **lista**: si può lavorare e studiare, o essere dipendente e autonomo |
| `empleo.tipo_contrato` | enum `tipo_contrato` | il contratto attuale (o l'ultimo, se `desempleado`) |
| `empleo.contrato_hasta` | data parziale | fine prevista del contratto attuale |
| `empleo.meses_cotizados_6_anios` | intero 0-72 | mesi cotizzati negli ultimi 6 anni (12 mesi = 360 giorni) |
| `empleo.inscrito_demandante` | booleano | iscritto come demandante de empleo (SEPE/LABORA) |
| `empleo.cobra_prestacion` | booleano | riceve ora prestación o subsidio por desempleo |
| `estudios.nivel_max` | enum `nivel_estudios` | titolo più alto terminato |
| `estudios.matriculado_en` | enum `matriculado_en` | cosa studia adesso (il principale) |
| `estudios.titulo_extranjero` | booleano | il titolo più alto è stato ottenuto fuori da `residencia.pais` |
| `estudios.titulo_pais` | ISO 3166-1 alfa-2 | paese del titolo più alto |
| `estudios.homologacion` | enum `homologacion` | stato di homologación/equivalencia di quel titolo |
| `hogar.miembros` | intero 1-30 | persone della **famiglia** che vivono con lei, contando lei stessa (coppia, figli, altri parenti). I coinquilini non contano |
| `hogar.hijos` | lista di `{anio_nacimiento, mes_nacimiento}` | figli e figlie che vivono con lei o sono a suo carico, anche maggiorenni. `[]` = nessuno. Ogni elemento accetta `no_lo_se` nei due campi |
| `hogar.pareja` | enum `pareja` | coppia con cui convive |
| `hogar.monoparental` | booleano | unico adulto a carico di figli minori |
| `hogar.familia_numerosa` | enum `familia_numerosa` | titolo di familia numerosa |
| `vivienda.regimen` | enum `regimen_vivienda` | |
| `vivienda.alquiler_mensual` | intero € | affitto mensile che paga lei (la sua parte) |
| `vivienda.contrato_a_su_nombre` | booleano | il contratto d'affitto è a suo nome |
| `ingresos.ejercicio` | intero | anno a cui si riferiscono le cifre (di solito l'anno scorso). **Non** accetta `no_lo_se` |
| `ingresos.individual` | `{tramo, importe}` | ingressi **lordi** annui della persona |
| `ingresos.hogar` | `{tramo, importe}` | ingressi lordi annui della famiglia di `hogar.miembros` |
| `ingresos.patrimonio_sin_vivienda` | `{tramo, importe}` | risparmi e beni, esclusa la casa in cui vive |
| `vinculos.entidad_trabajo` | `{tipo, ambito}` | ente per cui lavora: `tipo` enum `tipo_entidad`, `ambito` codice come in §4.2 |
| `vinculos.entidad_estudios` | `{tipo, ambito}` | ente in cui studia (stesso formato) |
| `vinculos.paises_origen` | lista ISO 3166-1 | nazionalità **d'origine** (dalla nascita); apre le convenzioni bilaterali e la nazionalità a 2 anni |
| `vinculos.paises_cotizacion` | lista ISO 3166-1 | paesi, diversi da `residencia.pais`, in cui ha lavorato e cotizzato. `[]` = nessuno |
| `vinculos.afiliaciones` | lista enum `afiliacion` | colegio profesional, sociedad científica, asociación… (l'adesione sindacale non si chiede: dato di cui all'art. 9 GDPR) |
| `vinculos.permiso_conducir_pais` | ISO 3166-1 | paese che ha rilasciato la patente |
| `intereses` | lista enum `interes` | nella v1.1 non lo usa né il motore né l'ordinamento: si conserva per dopo. Vietato nelle regole. Non accetta `no_lo_se` |
| `solicitudes` | lista | §2.7 |
| (salute) | — | nessun campo nella v1.1, §2.6 |

`{tramo, importe}`: `tramo` è un codice della tabella §2.5, `importe` è un intero in euro
senza centesimi (≥ 0). Entrambi facoltativi. **Se c'è `importe`, vale `importe` e `tramo`
si ignora**; l'interfaccia, quando scrive un importe, riscrive il tramo coerente.

«I vinculos» sono le connessioni della persona che aprono ayudas specifiche: l'ente di
lavoro e di studio (per tipo e territorio, non per nome: nella v1.1 una regola non può
puntare a un ente preciso), i paesi d'origine e di cotizzazione, le affiliazioni.

### 2.3 Valori che contano come «manca»

In **qualunque** campo enum e in qualunque lista enum, questi codici sono *indeterminati*
e il motore li tratta come un dato mancante:

| codice | quando si usa |
|---|---|
| `no_lo_se` | «No lo sé». Ammesso in ogni foglia di `persona`…`vinculos` salvo `ingresos.ejercicio`, `intereses`, `residencia.municipio`, `persona.sexo` e `hogar.pareja` (che usano `prefiero_no_decirlo`). Nelle liste enum (`empleo.situaciones`, `vinculos.afiliaciones`) e nelle liste di paesi vale per la lista intera, non come elemento |
| `otro` | la risposta della persona non è fra le opzioni |
| `prefiero_no_decirlo` | solo in `persona.sexo` e `hogar.pareja` |

Un catalogo non può usarli come `valor` di una regola (lo schema lo impedisce).

### 2.4 Le opzioni con le loro etichette

Le etichette sono il testo che vede l'utente. Per `situacion_administrativa` sono scritte
come compaiono sul documento, ma **vanno confrontate con i modelli ufficiali** di TIE e
certificati (lavoro della ricerca; se cambia un'etichetta il codice resta uguale).

**`sexo`**

| codice | etichetta (es) |
|---|---|
| `mujer` | Mujer |
| `hombre` | Hombre |
| `otro` | Otra respuesta |
| `prefiero_no_decirlo` | Prefiero no decirlo |

**`situacion_administrativa`**

| codice | etichetta (es) |
|---|---|
| `nacional` | Tengo la nacionalidad española (DNI) |
| `ciudadano_ue` | Ciudadano/a de la UE, del EEE o de Suiza con certificado de registro (el certificado verde) |
| `ciudadano_ue_permanente` | Ciudadano/a de la UE, del EEE o de Suiza con certificado de residencia permanente |
| `ciudadano_ue_sin_registro` | Ciudadano/a de la UE, del EEE o de Suiza, todavía sin certificado de registro |
| `familiar_ue` | Tarjeta de residencia de familiar de ciudadano de la Unión |
| `familiar_ue_permanente` | Tarjeta de residencia permanente de familiar de ciudadano de la Unión |
| `residencia_temporal` | Residencia temporal (TIE): por trabajo, arraigo, reagrupación familiar u otro motivo |
| `residencia_larga_duracion` | Residencia de larga duración (TIE). Antes se llamaba «residencia permanente» |
| `residencia_larga_duracion_ue` | Residencia de larga duración-UE (TIE) |
| `estancia_estudios` | Autorización por estudios, movilidad de estudiantes o prácticas |
| `proteccion_internacional_solicitante` | He pedido protección internacional (documento de solicitante, la «tarjeta roja») |
| `proteccion_internacional` | Tengo asilo o protección subsidiaria concedida |
| `proteccion_temporal` | Protección temporal (por ejemplo, personas desplazadas de Ucrania) |
| `residencia_art50_tue` | Documento de residencia artículo 50 TUE (Reino Unido) |
| `otro` | Otra situación, no aparece aquí |
| `no_lo_se` | No lo sé |

Nella v1.1 non c'è un'opzione per chi non ha un documento in vigore. Chi non si riconosce in
nessuna opzione sceglie, nel questionario, «Otra situación o prefiero no decirlo»: il campo
resta **vuoto** (non si scrive), le schede che lo leggono danno «Te falta un dato», e
l'interfaccia accanto a quella domanda rinvia a una ONG dell'elenco `ayuda_humana` (`tipo:
"ong"`). Non si chiede mai di dichiarare che non si ha un documento.

**`empleo_situacion`**

| codice | etichetta (es) |
|---|---|
| `asalariado` | Trabajo con contrato (por cuenta ajena) |
| `autonomo` | Trabajo como autónomo/a (por cuenta propia) |
| `desempleado` | No tengo trabajo y lo busco |
| `estudiante` | Estudio |
| `inactivo` | No trabajo ni busco trabajo |
| `jubilado` | Estoy jubilado/a |
| `otro` | Otra situación |

**`tipo_contrato`**

| codice | etichetta (es) |
|---|---|
| `indefinido` | Indefinido |
| `fijo_discontinuo` | Fijo discontinuo |
| `temporal` | Temporal (de duración determinada) |
| `predoctoral` | Contrato predoctoral (Ley de la Ciencia) |
| `cientifico_tecnico` | Contrato de actividades científico-técnicas (ligado a un proyecto) |
| `postdoctoral` | Contrato postdoctoral o de acceso de personal investigador doctor |
| `formativo` | Contrato formativo o de prácticas |
| `funcionario` | Soy funcionario/a |
| `ninguno` | No tengo contrato |
| `otro` | Otro tipo de contrato |
| `no_lo_se` | No lo sé |

**`nivel_estudios`**

| codice | etichetta (es) |
|---|---|
| `ninguno` | Sin estudios terminados |
| `primaria` | Educación primaria |
| `eso` | ESO o equivalente |
| `bachillerato` | Bachillerato |
| `fp_medio` | FP de grado medio |
| `fp_superior` | FP de grado superior |
| `grado` | Grado, licenciatura o diplomatura |
| `master` | Máster |
| `doctorado` | Doctorado |
| `otro` | Otros estudios |
| `no_lo_se` | No lo sé |

**`matriculado_en`**

| codice | etichetta (es) |
|---|---|
| `ninguno` | Ahora no estudio |
| `secundaria` | ESO o Bachillerato |
| `fp` | Formación Profesional |
| `grado` | Grado |
| `master` | Máster |
| `doctorado` | Doctorado |
| `idiomas` | Idiomas |
| `otro` | Otros estudios |
| `no_lo_se` | No lo sé |

**`homologacion`**

| codice | etichetta (es) |
|---|---|
| `no_pedida` | No la he pedido |
| `en_tramite` | La he pedido y está en trámite |
| `concedida` | Me han dado la homologación o la equivalencia |
| `denegada` | Me la han denegado |
| `no_lo_se` | No lo sé |

**`pareja`**

| codice | etichetta (es) |
|---|---|
| `no` | No vivo en pareja |
| `matrimonio` | Casado/a |
| `pareja_de_hecho` | Pareja de hecho registrada |
| `pareja_sin_registrar` | Pareja sin registrar |
| `prefiero_no_decirlo` | Prefiero no decirlo |

**`familia_numerosa`**

| codice | etichetta (es) |
|---|---|
| `no` | No |
| `general` | Sí, categoría general |
| `especial` | Sí, categoría especial |
| `no_lo_se` | No lo sé |

**`regimen_vivienda`**

| codice | etichetta (es) |
|---|---|
| `alquiler` | Alquilo una vivienda entera |
| `habitacion` | Alquilo una habitación |
| `propiedad` | Es mía y está pagada |
| `hipoteca` | Es mía y pago hipoteca |
| `cedida` | Vivo sin pagar alquiler (me la dejan familia u otras personas) |
| `sin_hogar` | No tengo vivienda |
| `otro` | Otra situación |
| `no_lo_se` | No lo sé |

**`tipo_entidad`**

| codice | etichetta (es) |
|---|---|
| `universidad_publica` | Universidad pública |
| `universidad_privada` | Universidad privada |
| `organismo_publico_investigacion` | Organismo público de investigación (por ejemplo, el CSIC) |
| `centro_investigacion` | Fundación o centro de investigación |
| `hospital_o_instituto_sanitario` | Hospital o instituto de investigación sanitaria |
| `administracion_publica` | Administración pública |
| `empresa` | Empresa |
| `ong_o_fundacion` | ONG, asociación o fundación |
| `centro_formacion` | Centro de FP, escuela de idiomas o academia |
| `otro` | Otra |
| `no_lo_se` | No lo sé |

**`afiliacion`**

| codice | etichetta (es) |
|---|---|
| `colegio_profesional` | Colegio profesional |
| `sociedad_cientifica` | Sociedad científica |
| `asociacion` | Asociación (de personas migrantes, vecinal, cultural…) |
| `otro` | Otra |

**`interes`**

| codice | etichetta (es) |
|---|---|
| `investigacion` | Investigación |
| `emprendimiento` | Emprender |
| `empleo` | Encontrar trabajo |
| `empleo_remoto` | Trabajo en remoto |
| `formacion` | Formación |
| `estudios` | Estudiar |
| `nacionalidad` | Nacionalidad española |
| `vivienda` | Vivienda |
| `familia` | Familia |

**`estado_solicitud`**

| codice | etichetta (es) |
|---|---|
| `interesa` | Me interesa |
| `presentada` | La he presentado |
| `respuesta` | Me han contestado |
| `cobrada` | La he cobrado |
| `denegada` | Me la han denegado |

### 2.5 Tramos di reddito

Valgono per `ingresos.individual`, `ingresos.hogar` e `ingresos.patrimonio_sin_vivienda`.
Ogni tramo è un intervallo **chiuso di interi** in euro.

| codice | intervallo in € (estremi inclusi) | etichetta (es) |
|---|---|---|
| `cero` | [0, 0] | Nada (0 €) |
| `hasta_6000` | [1, 6000] | Hasta 6.000 € |
| `de_6001_a_9000` | [6001, 9000] | De 6.001 a 9.000 € |
| `de_9001_a_12000` | [9001, 12000] | De 9.001 a 12.000 € |
| `de_12001_a_15000` | [12001, 15000] | De 12.001 a 15.000 € |
| `de_15001_a_18000` | [15001, 18000] | De 15.001 a 18.000 € |
| `de_18001_a_21000` | [18001, 21000] | De 18.001 a 21.000 € |
| `de_21001_a_25000` | [21001, 25000] | De 21.001 a 25.000 € |
| `de_25001_a_30000` | [25001, 30000] | De 25.001 a 30.000 € |
| `de_30001_a_40000` | [30001, 40000] | De 30.001 a 40.000 € |
| `de_40001_a_50000` | [40001, 50000] | De 40.001 a 50.000 € |
| `de_50001_a_70000` | [50001, 70000] | De 50.001 a 70.000 € |
| `mas_de_70000` | [70001, ∞] | Más de 70.000 € |
| `no_lo_se` | (manca) | No lo sé |

Nell'interfaccia l'opzione «Prefiero no decirlo» dei redditi salva `no_lo_se`: `prefiero_no_decirlo`
non è un codice di tramo (§2.4 lo riserva a `persona.sexo` e `hogar.pareja`). Entrambe le
opzioni danno «Te falta un dato».

### 2.6 Salute: nessun campo

Nella v1.1 il profilo **non ha** nessun campo di salute o disabilità: lo schema non lo nomina
e `additionalProperties: false` rifiuta qualunque chiave che non sia in §2.2. Le regole non
possono leggerlo (non è nella lista §4.3). Motivo: i dati di salute e
disabilità sono categoria particolare (art. 9 RGPD) e il verdetto del consiglio li ha
tolti dalla prima versione. Le schede che dipendono dalla disabilità mettono quel
requisito in `requisitos_no_evaluables`. Una v2 che lo aggiunga deve prima avere la base
giuridica scritta.

### 2.7 `solicitudes`: il tracciamento

```json
"solicitudes": [
  { "ayuda": "es-vc-bono-alquiler-joven", "estado": "presentada", "fecha": "2026-11-03",
    "registro": "…", "convocatoria": "2026", "nota": "…" }
]
```

| campo | obbl. | significato |
|---|---|---|
| `ayuda` | sì | `id` di una scheda del catalogo |
| `estado` | sì | stato **attuale**: `interesa` «Me interesa», `presentada` «La he presentado», `respuesta` «Me han contestado» (concessione non ancora pagata, requerimiento o propuesta de resolución), `cobrada` «La he cobrado», `denegada` «Me la han denegado» |
| `fecha` | sì | `AAAA-MM-DD` in cui la domanda è entrata nello stato attuale |
| `registro` | no | numero di registro di entrata o di expediente |
| `convocatoria` | no | anno o nome della convocatoria, per distinguere due domande alla stessa ayuda |
| `nota` | no | testo libero, max 500 caratteri |

Una ayuda può comparire più volte (convocatorie diverse). Se `ayuda` non esiste più nel
catalogo, l'interfaccia mostra la riga con «Ficha retirada del catálogo» e non la
cancella. Le `solicitudes` non cambiano mai l'esito del motore. L'interfaccia per
compilarle arriva dopo le 08:45; il formato c'è da stanotte.

---

## 3. I campi calcolati (`calc.*`)

Le regole non leggono l'anno di nascita, i figli o il reddito grezzi: leggono questi campi, che il
motore calcola dal profilo e da `hoy` (data locale del browser, `AAAA-MM-DD`, passata come
parametro). **Ogni campo numerico si risolve in un intervallo chiuso `[lo, hi]`**, con `hi`
che può essere infinito; un numero esatto è `[x, x]`. Se il dato di partenza manca, il
campo calcolato «manca».

### 3.1 Date parziali

Una data parziale `F` rappresenta tutte le date possibili:

| `F` | `prima(F)` | `ultima(F)` |
|---|---|---|
| `AAAA` | `AAAA-01-01` | `AAAA-12-31` |
| `AAAA-MM` | `AAAA-MM-01` | ultimo giorno di quel mese (anni bisestili inclusi) |
| `AAAA-MM-DD` | quella data | quella data |

Funzioni (date complete, confronto per tupla `(mese, giorno)`):

```
anni_compiuti(da, a) = a.anno - da.anno - (1 se (a.mese, a.giorno) < (da.mese, da.giorno) altrimenti 0)
mesi_compiuti(da, a) = (a.anno - da.anno) * 12 + (a.mese - da.mese) - (1 se a.giorno < da.giorno altrimenti 0)
```

Una data con giorno o mese impossibile (`2025-02-30`) è un dato non valido (§5.6).

### 3.2 Formule

| campo | da | come |
|---|---|---|
| `calc.edad` | `persona.anio_nacimiento`, `persona.mes_nacimiento` | `F` = `"AAAA"` o `"AAAA-MM"`. `lo = anni_compiuti(ultima(F), hoy)`, `hi = anni_compiuti(prima(F), hoy)`. Se `prima(F) > hoy`: dato non valido |
| `calc.anios_residencia_legal` | `situacion_administrativa.residencia_legal_desde` | `lo = max(0, anni_compiuti(ultima(F), hoy))`, `hi = anni_compiuti(prima(F), hoy)`. Se `prima(F) > hoy`: non valido |
| `calc.meses_residencia_legal` | idem | come sopra con `mesi_compiuti` |
| `calc.anios_empadronado` | `residencia.empadronado_desde` | come `anios_residencia_legal` |
| `calc.meses_empadronado` | idem | con `mesi_compiuti` |
| `calc.num_hijos` | `hogar.hijos` | `[n, n]` con `n` = lunghezza della lista (anche se le età mancano) |
| `calc.hijos_menores_3`, `_18`, `_25` | `hogar.hijos` | per ogni figlio si calcola l'età come `calc.edad`. Con soglia `N`: **sicuramente minore** se `hi < N`; **sicuramente no** se `lo ≥ N`; altrimenti incerto. Un figlio con anno mancante o `no_lo_se` è incerto. `lo` = sicuri, `hi` = sicuri + incerti |
| `calc.ingresos_individuales` | `ingresos.individual` | `importe` → `[importe, importe]`; altrimenti `tramo` → intervallo della §2.5; altrimenti manca |
| `calc.ingresos_hogar` | `ingresos.hogar` | come sopra. **Se `ingresos.hogar` manca e `hogar.miembros == 1`**, vale `calc.ingresos_individuales` |
| `calc.ingresos_hogar_por_miembro` | `calc.ingresos_hogar`, `hogar.miembros` | `[lo / m, hi / m]` (numeri reali, niente arrotondamento); manca se manca uno dei due |
| `calc.patrimonio_sin_vivienda` | `ingresos.patrimonio_sin_vivienda` | come `ingresos_individuales` |

Gli ingressi sono **lordi** (prima delle tasse). Quando le bases misurano un'altra cosa
(base imponible, base liquidable, renta per cápita con altre regole), la regola deve usare
`no_concluyente` (§4.4): un lordo sotto la soglia basta, un lordo sopra no.

Esempi con `hoy = 2026-10-14` (da usare come test del motore):

| profilo | campo | valore |
|---|---|---|
| Lucía (1998, mese 3) | `calc.edad` | `[28, 28]` |
| Rodrigo (1991, mese mancante) | `calc.edad` | `[34, 35]` |
| Rodrigo (`residencia_legal_desde` `2021-06`) | `calc.anios_residencia_legal` | `[5, 5]` |
| Rodrigo (`empadronado_desde` `2019`) | `calc.anios_empadronado` | `[6, 7]` |
| Rodrigo (idem) | `calc.meses_empadronado` | `[81, 93]` |
| Lucía (`hijos: []`) | `calc.hijos_menores_3` | `[0, 0]` |
| Lucía (tramo `de_18001_a_21000`, `miembros: 1`, niente `ingresos.hogar`) | `calc.ingresos_hogar` | `[18001, 21000]` |
| Rodrigo (`individual.tramo: "no_lo_se"`) | `calc.ingresos_individuales` | manca |
| Rodrigo (niente `hogar`) | `calc.num_hijos` | manca |

---

## 4. Il catalogo

### 4.1 Forma del file

```json
{
  "esquema": "tamiz-catalogo",
  "version": 1.1,
  "actualizado_el": "2026-10-14",
  "redactado_con_ia": true,
  "revision_humana": { "completa": false, "por": null, "el": null },
  "sitio": { "nombre": "Tamiz", "lema": "…", "url": "https://…", "repo": "nerln/tamiz" },
  "fichas": [ … ],
  "ayuda_humana": [ … ],
  "grupos_paises": { "UE": ["AT", "BE", …] },
  "glosario": [ { "termino": "IPREM", "explicacion": "…" } ]
}
```

Obbligatori: `esquema`, `version`, `actualizado_el`, `redactado_con_ia`, `revision_humana`,
`fichas`, `ayuda_humana`. Una scheda scritta da sola (per esempio da una ricerca) si valida
contro `#/$defs/ficha`.

| campo | significato |
|---|---|
| `actualizado_el` | il giorno del build (`construir.py --hoy`, default oggi). L'interfaccia lo mostra in grande: «Datos revisados el {actualizado_el}» |
| `redactado_con_ia` | `true` se le schede le ha scritte o lette un agente IA. Oggi sempre `true` (costante in `construir.py`) |
| `revision_humana` | `{completa, por, el}`. `completa: true` solo quando una persona ha rivisto **tutto** il catalogo; allora `por` (chi) ed `el` (data) sono obbligatori. Finché è `false`, la home dice «fichas redactadas con IA, sin revisión humana todavía» |
| `sitio` | copia di `sitio.json`: `nombre`, `lema`, `url`, `repo` obbligatori; `responsable`, `contacto`, `nombre_anterior` facoltativi. L'interfaccia prende il nome **solo** da qui (§6.8) |
| `grupos_paises` | i gruppi di §4.3; `construir.py` mette sempre `UE`, `EEE_no_UE`, `Suiza` e aggiunge quelli di `catalogo/grupos_paises.json` se c'è |
| `glosario` | §4.9 |

### 4.2 La scheda (`ficha`)

| campo | obbl. | tipo | significato |
|---|---|---|---|
| `id` | sì | `^[a-z0-9]+(-[a-z0-9]+)*$`, max 80 | stabile per sempre (le `solicitudes` lo citano). Convenzione: prefisso = `ambito` in minuscolo (`es-vc-…`, `es-…`, `eu-…`) |
| `nombre` | sì | testo | nome ufficiale o il più vicino |
| `tipo` | sì | `derecho` \| `oportunidad` | §4.5 |
| `subtipo` | sì | enum | `beca`, `subvencion`, `prestacion`, `deduccion_fiscal`, `descuento`, `premio`, `empleo`, `formacion_remunerada`, `tramite_ventaja`, `servicio_gratuito` |
| `area` | sì | enum | l'area tematica, per raggruppare e filtrare i risultati: `familia`, `vivienda`, `empleo`, `estudios`, `investigacion`, `impuestos`, `salud_cuidados`, `extranjeria`, `emprender`, `jovenes_ocio`, `servicios_sociales`, `empleo_publico` (in quest'ordine l'interfaccia le mostra). Una scheda sta in una sola area: quella di chi la cerca (il CAPI dell'IMV è `familia`, l'IMV è `servicios_sociales`, il bono social eléctrico è `vivienda`) |
| `informativa` | no | booleano, default `false` | `true` se la scheda dipende da una situazione che il sito **non chiede** (discapacidad, dependencia, salute, violencia de género, situazioni giudiziarie: le categorie dell'art. 9 GDPR non si chiedono mai) o non ha una regola valutabile sul gruppo a cui si rivolge. Non riceve un esito: il motore la mette in `informativas` e l'interfaccia la mostra in «Otras ayudas que conviene conocer», per area. Le sue `requisitos` non si valutano (di solito `[]`) |
| `concesion` | sì | enum | `reglada`, `orden_de_llegada`, `concurrencia_competitiva`, `no_aplica`, `desconocida` (§4.5) |
| `solicita` | no | enum | chi presenta la domanda: `persona` (default, anche se il campo manca), `empresa`, `universidad`, `director_tesis`, `otro`. Se non è `persona`, l'interfaccia lo dice («La presenta la empresa») |
| `organismo` | sì | testo | chi la concede |
| `ambito` | sì | `EU`, ISO 3166-1 (`ES`) o ISO 3166-2 **di primo livello** (`ES-VC`) | territorio dell'organismo. Le ayudas di una provincia o di un comune hanno come `ambito` la loro comunità autonoma, e la provincia o il comune vanno in una regola (`residencia.provincia`, `residencia.municipio_ine`). **Non** genera regole da solo: serve a filtrare (§6.4) |
| `resumen` | sì | testo ≤ 400 | una o due frasi semplici |
| `cuantia` | sì | `{texto, importe_eur?, periodicidad?, duracion_meses_max?}` | `texto` è quello che si mostra; il resto serve a ordinare. `periodicidad`: `unica`, `mensual`, `anual`, `variable`, `no_monetaria` |
| `requisitos` | sì | lista di nodi (§4.3) | tutti devono valere (AND). `[]` è ammesso **solo** con `informativa: true`: una scheda senza regole darebbe «Parece que encajas» a chiunque. Una scheda valutabile ha almeno una regola sul gruppo a cui si rivolge (età, studi, situazione lavorativa…), non solo sul territorio |
| `requisitos_no_evaluables` | sì | lista di testi | requisiti che il motore non sa controllare; si mostrano sempre sotto «Además, comprueba en las bases:» |
| `plazo` | sì | §4.6 | |
| `compatibilidad` | sì | §4.7 | |
| `siguiente_paso` | sì | `{texto, url?}` | un'azione concreta: «Pide cita en…», «Preséntala en la sede electrónica de…» |
| `ayuda_humana` | sì, ≥ 1 | lista di `id` di `catalogo.ayuda_humana` | chi aiuta gratis (§4.8) |
| `como_pedirla` | no | testo | canali (sede electrónica, presenziale, certificado digital, Cl@ve) |
| `fuente` | sì | URL `https://` | la pagina **esatta** dove sono stati letti requisiti e importi |
| `url_oficial` | sì | URL `https://` | la pagina ufficiale della procedura (può coincidere con `fuente`) |
| `simulador_oficial` | no | URL `https://` | simulatore ufficiale (SEPE, IMV, Agencia Tributaria…) da linkare, non da rifare |
| `bdns` | no | 3-8 cifre | codice BDNS della convocatoria |
| `verificado_el` | sì | `AAAA-MM-DD` o `null` | giorno in cui **una persona** ha confrontato la scheda con `fuente`. `null` finché nessuna persona l'ha fatto: un agente IA (anche un tester) non conta mai come persona |
| `leido_por_agente` | sì | `AAAA-MM-DD` | giorno in cui un agente IA ha letto la fonte ufficiale e scritto o corretto la scheda |
| `revisar_antes_de` | sì | `AAAA-MM-DD`, **dopo** `leido_por_agente` | dal giorno dopo la scheda è «Por revisar» (§6.5). Default: `leido_por_agente` + 90 giorni; se c'è un `plazo.fin` che cade **dopo** `leido_por_agente` e prima di quella data, `plazo.fin`. Un `plazo.fin` già passato non conta (darebbe una scheda già scaduta). Se c'è `verificado_el`, non può essere dopo `revisar_antes_de` |
| `confianza` | sì | `alta` \| `media` \| `baja` | `alta`: requisiti, importo e plazo letti nelle bases ufficiali vigenti. `media`: letti su una pagina ufficiale ma non nelle bases, o nelle bases dell'anno scorso. `baja`: fonte secondaria. **Solo `alta` si pubblica**: `catalogo/fichas/` contiene solo schede `alta` (salvo i file `*-candidata.json`, che il build salta), le altre stanno in `catalogo/por-revisar/` |
| `_revisar` | no | lista di testi, ≥ 1 (mai `true`) | cose da controllare a mano (le scrive il convertitore o chi verifica). **Una scheda con `_revisar` non si pubblica** |

### 4.3 Le regole

Un **nodo** di `requisitos` è una regola o un gruppo.

**Regola:**

```json
{ "campo": "calc.edad", "op": "<=", "valor": 35,
  "texto": "Tener 35 años o menos",
  "cita": "Base 3.1.a de la convocatoria",
  "no_concluyente": ["no_cumple"],
  "aclaracion": "Las bases miden la base imponible, no los ingresos brutos" }
```

| chiave | obbl. | significato |
|---|---|---|
| `campo` | sì | uno dei campi della tabella sotto, e nessun altro |
| `op` | sì | uno degli operatori ammessi per quel campo |
| `valor` | sì (o `valor_grupo`) | tipo dato dalla tabella; per `in`, `not_in`, `contains_any`, `contains_none` è una lista di ≥ 1 elementi |
| `valor_grupo` | in alternativa a `valor` | nome di una lista di `catalogo.grupos_paises`; solo sui campi paese e solo con gli operatori di lista |
| `texto` | sì | il requisito come lo legge l'utente, in spagnolo semplice, in forma affermativa («Tener 35 años o menos») |
| `cita` | no | articolo o base da cui viene la regola, per chi verifica |
| `no_concluyente` | no | §4.4 |
| `aclaracion` | no | si mostra quando la regola esce `falta_dato` per `no_concluyente` |

**Gruppi:**

```json
{ "any_of": [ nodo, nodo, … ], "texto": "Residencia legal en España" }
{ "all_of": [ nodo, nodo, … ], "texto": "Trabajar y estar empadronado" }
```

`any_of` = basta uno (OR); `all_of` = tutti (AND, serve dentro un `any_of`). Liste di ≥ 1
nodi, `texto` obbligatorio. Profondità consigliata ≤ 2.

**Requisito condizionale** («si eres ciudadano de la UE, debes estar inscrito…»): si
scrive come `any_of` fra «non sei nel caso» e «sei nel caso e hai il requisito».

**I campi che una regola può leggere** (lista chiusa, lo schema la impone):

| campo | tipo | operatori ammessi | `valor` |
|---|---|---|---|
| `calc.edad` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (edad en años cumplidos) |
| `calc.anios_residencia_legal` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (años cumplidos de residencia legal) |
| `calc.meses_residencia_legal` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (meses cumplidos de residencia legal) |
| `calc.anios_empadronado` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (años cumplidos de empadronamiento) |
| `calc.meses_empadronado` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (meses cumplidos de empadronamiento) |
| `calc.num_hijos` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (número de hijos) |
| `calc.hijos_menores_3` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (hijos de menos de 3 años) |
| `calc.hijos_menores_18` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (hijos de menos de 18 años) |
| `calc.hijos_menores_25` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (hijos de menos de 25 años) |
| `calc.ingresos_individuales` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (€ brutos/año, persona) |
| `calc.ingresos_hogar` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (€ brutos/año, hogar) |
| `calc.ingresos_hogar_por_miembro` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (€ brutos/año por miembro) |
| `calc.patrimonio_sin_vivienda` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (€ de patrimonio sin la vivienda habitual) |
| `hogar.miembros` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero |
| `vivienda.alquiler_mensual` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (€/mes) |
| `empleo.meses_cotizados_6_anios` | numero | `==`, `!=`, `<`, `<=`, `>`, `>=` | numero (meses) |
| `residencia.empadronado_desde` | fecha | `<`, `<=`, `>`, `>=` | data `AAAA-MM-DD` |
| `situacion_administrativa.residencia_legal_desde` | fecha | `<`, `<=`, `>`, `>=` | data `AAAA-MM-DD` |
| `situacion_administrativa.documento_desde` | fecha | `<`, `<=`, `>`, `>=` | data `AAAA-MM-DD` |
| `situacion_administrativa.documento_hasta` | fecha | `<`, `<=`, `>`, `>=` | data `AAAA-MM-DD` |
| `empleo.contrato_hasta` | fecha | `<`, `<=`, `>`, `>=` | data `AAAA-MM-DD` |
| `situacion_administrativa.autoriza_trabajar` | bool | `==`, `!=` | `true` / `false` |
| `empleo.inscrito_demandante` | bool | `==`, `!=` | `true` / `false` |
| `empleo.cobra_prestacion` | bool | `==`, `!=` | `true` / `false` |
| `estudios.titulo_extranjero` | bool | `==`, `!=` | `true` / `false` |
| `hogar.monoparental` | bool | `==`, `!=` | `true` / `false` |
| `vivienda.contrato_a_su_nombre` | bool | `==`, `!=` | `true` / `false` |
| `persona.sexo` | enum | `==`, `!=`, `in`, `not_in` | codici di `sexo` (tabella sotto) |
| `situacion_administrativa.tipo` | enum | `==`, `!=`, `in`, `not_in` | codici di `situacion_administrativa` (tabella sotto) |
| `empleo.tipo_contrato` | enum | `==`, `!=`, `in`, `not_in` | codici di `tipo_contrato` (tabella sotto) |
| `estudios.nivel_max` | enum | `==`, `!=`, `in`, `not_in` | codici di `nivel_estudios` (tabella sotto) |
| `estudios.matriculado_en` | enum | `==`, `!=`, `in`, `not_in` | codici di `matriculado_en` (tabella sotto) |
| `estudios.homologacion` | enum | `==`, `!=`, `in`, `not_in` | codici di `homologacion` (tabella sotto) |
| `hogar.pareja` | enum | `==`, `!=`, `in`, `not_in` | codici di `pareja` (tabella sotto) |
| `hogar.familia_numerosa` | enum | `==`, `!=`, `in`, `not_in` | codici di `familia_numerosa` (tabella sotto) |
| `vivienda.regimen` | enum | `==`, `!=`, `in`, `not_in` | codici di `regimen_vivienda` (tabella sotto) |
| `vinculos.entidad_trabajo.tipo` | enum | `==`, `!=`, `in`, `not_in` | codici di `tipo_entidad` (tabella sotto) |
| `vinculos.entidad_estudios.tipo` | enum | `==`, `!=`, `in`, `not_in` | codici di `tipo_entidad` (tabella sotto) |
| `residencia.pais` | codigo | `==`, `!=`, `in`, `not_in` | stringa `^[A-Z]{2}$`; per gli op di lista anche `valor_grupo` (ISO 3166-1) |
| `residencia.region` | codigo | `==`, `!=`, `in`, `not_in` | stringa `^[A-Z]{2}-[A-Z0-9]{1,3}$` (ISO 3166-2) |
| `residencia.provincia` | codigo | `==`, `!=`, `in`, `not_in` | stringa `^[A-Z]{2}-[A-Z0-9]{1,3}$` (ISO 3166-2) |
| `residencia.municipio_ine` | codigo | `==`, `!=`, `in`, `not_in` | stringa `^[0-9]{5}$` (código INE) |
| `estudios.titulo_pais` | codigo | `==`, `!=`, `in`, `not_in` | stringa `^[A-Z]{2}$`; per gli op di lista anche `valor_grupo` (ISO 3166-1) |
| `vinculos.entidad_trabajo.ambito` | codigo | `==`, `!=`, `in`, `not_in` | stringa `^(EU|[A-Z]{2}|[A-Z]{2}-[A-Z0-9]{1,3})$` |
| `vinculos.entidad_estudios.ambito` | codigo | `==`, `!=`, `in`, `not_in` | stringa `^(EU|[A-Z]{2}|[A-Z]{2}-[A-Z0-9]{1,3})$` |
| `vinculos.permiso_conducir_pais` | codigo | `==`, `!=`, `in`, `not_in` | stringa `^[A-Z]{2}$`; per gli op di lista anche `valor_grupo` (ISO 3166-1) |
| `persona.nacionalidades` | lista | `contains`, `not_contains`, `contains_any`, `contains_none` | stringa `^[A-Z]{2}$`; per gli op di lista anche `valor_grupo` (ISO 3166-1) |
| `vinculos.paises_origen` | lista | `contains`, `not_contains`, `contains_any`, `contains_none` | stringa `^[A-Z]{2}$`; per gli op di lista anche `valor_grupo` (ISO 3166-1) |
| `vinculos.paises_cotizacion` | lista | `contains`, `not_contains`, `contains_any`, `contains_none` | stringa `^[A-Z]{2}$`; per gli op di lista anche `valor_grupo` (ISO 3166-1) |
| `empleo.situaciones` | lista | `contains`, `not_contains`, `contains_any`, `contains_none` | codici di `empleo_situacion` (tabella sotto) |
| `vinculos.afiliaciones` | lista | `contains`, `not_contains`, `contains_any`, `contains_none` | codici di `afiliacion` (tabella sotto) |

I campi paese accettano `valor_grupo`. Gruppi normativi da mettere in
`catalogo.grupos_paises` (codici ISO, quindi Grecia è `GR`):

- `UE`: `AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK` (27).
- `EEE_no_UE`: `IS LI NO`. `Suiza`: `CH`.
- `nacionalidad_2_anios` (iberoamericani, Andorra, Filippine, Guinea Equatoriale, Portogallo,
  art. 22 Código Civil): **la lista la scrive la ricerca dalla fonte**, non questo file.

### 4.4 `no_concluyente`

Lista con `"no_cumple"`, `"cumple"` o entrambi. Se la regola esce con un esito che sta
nella lista, il motore lo cambia in `falta_dato` con motivo `no_concluyente` e **senza
domanda** (rispondere meglio non aiuterebbe). Caso tipico: soglia sulla base liquidable,
dato lordo nel profilo → il lordo sta sempre sopra la base, quindi `<=` con lordo sotto la
soglia è conclusivo (`cumple`), con lordo sopra no: `"no_concluyente": ["no_cumple"]`.
Per un `>=` su una misura più bassa del lordo vale il contrario: `["cumple"]`.

### 4.5 `tipo` e `concesion`

| `concesion` | significato | `tipo` |
|---|---|---|
| `reglada` | chi ha i requisiti la ottiene (prestaciones, deducciones, trámites reglados) | `derecho` (obbligatorio) |
| `orden_de_llegada` | si concede a chi ha i requisiti finché ci sono fondi | `derecho` o `oportunidad`; la scheda lo dice nel `resumen` |
| `concurrencia_competitiva` | si confrontano le domande, vince una parte | `oportunidad` (obbligatorio) |
| `no_aplica` | servizi, offerte di lavoro, trámites senza concessione | libero |
| `desconocida` | non si è potuto verificare | libero |

Inoltre `subtipo` `premio` o `empleo` ⇒ `tipo: "oportunidad"`. Lo schema impone i tre
vincoli.

### 4.6 `plazo`

```json
{ "tipo": "fechas", "inicio": "2026-11-01", "fin": "2026-11-30",
  "verificado": true, "fuente": "https://…", "nota": "…" }
```

| `tipo` | significato | `inicio` / `fin` |
|---|---|---|
| `abierto_todo_el_ano` | si chiede in qualunque momento. Le scadenze relative («15 días hábiles desde el fin del contrato») vanno in `nota` | vietati |
| `convocatoria_anual` | si apre una volta l'anno (anche la campagna della Renta); quest'anno le date non sono pubblicate o non sono ancora note | vietati (la stagione abituale va in `nota`) |
| `fechas` | convocatoria con date pubblicate | `fin` obbligatorio, `inicio` facoltativo; estremi **inclusi**, ora di Madrid |
| `cerrado` | l'ultima convocatoria è chiusa e non se ne conosce un'altra | facoltativi (le date dell'ultima) |
| `desconocido` | non si sa | vietati; `verificado` deve essere `false` |

- `verificado` (obbligatorio): `true` **solo** se le date (o il tipo) sono state lette nel
  testo ufficiale della convocatoria (resolución, DOGV, BOE), non in una notizia né in una
  pagina riassuntiva, e `plazo.fuente` punta a quel testo. **Solo le date verificate vanno
  nell'ICS** (§6.6).
- `fuente`: URL del testo ufficiale da cui vengono le date. **Obbligatorio se `verificado` è
  `true`** (lo schema lo impone), anche quando coincide con `ficha.fuente`.
- `mes_habitual` (facoltativo, intero 1-12): per le convocatorie annuali, il mese in cui di
  solito si aprono, letto sulle convocatorie degli anni precedenti (non su notizie). Ha senso
  con `convocatoria_anual`, `cerrado` e `fechas`; con `abierto_todo_el_ano` `validar.py` dà un
  avviso. L'interfaccia lo mostra come «Suele abrirse en {mes}» con la nota «orientativo»; non
  entra nell'ICS, non cambia `apertura` né l'esito.
- Il `plazo` **non cambia mai l'esito**: una scheda chiusa che «encaja» resta «Parece que
  encajas», con la riga del plazo che dice che è chiusa.

Stato mostrato per `fechas`: `hoy < inicio` → «Abre el {inicio}»; `inicio ≤ hoy ≤ fin` (o
manca `inicio` e `hoy ≤ fin`) → «Abierto hasta el {fin}»; `hoy > fin` → «Plazo terminado el
{fin}». Le date si mostrano come `30/11/2026`.

### 4.7 `compatibilidad`

```json
{ "declarada_en_bases": true,
  "incompatible_con": ["es-bono-alquiler-estatal"],
  "compatible_con": [],
  "texto": "Si cobras esta ayuda, no puedes cobrar el Bono Alquiler estatal por los mismos meses.",
  "fuente": "https://…#articulo-7" }
```

- `declarada_en_bases: false` → niente liste, niente `texto`, niente `fuente` (lo schema lo
  impone). L'interfaccia scrive «Compatibilidad no verificada».
- `declarada_en_bases: true` → `texto` e `fuente` obbligatori. `texto` è una frase umana
  presa dalle bases. Le liste citano `id` di schede (possono essere vuote se le bases
  parlano di «otras ayudas para la misma finalidad»: allora lo dice il `texto`).
- **Mai dedurre** la compatibilità. Se le bases di A dicono che A è incompatibile con B, lo
  scrive solo A; la scheda di B lo mostra lo stesso (§6.7).

### 4.8 `ayuda_humana` (lista del catalogo)

Ogni elemento: `id`, `nombre`, `tipo` (`sindicato`, `ong`, `administracion`, `universidad`,
`colegio_profesional`, `otro`), `que_hace`, `ambito`, `gratuito: true` (obbligatorio: chi
fa pagare non entra), `fuente`, `verificado_el`; facoltativi `para_quien`,
`municipio_ine`, `direccion`, `telefono`, `url`, `horario`. Almeno uno fra `url`,
`telefono`, `direccion`. `verificado_el` è una data o `null` (nessuna persona l'ha ancora
controllata). La stessa lista alimenta la pagina «Ayuda humana».

### 4.9 `glosario`

`[{termino, explicacion}]`. L'interfaccia mette la spiegazione accanto a ogni termine che
compare in una domanda o in una scheda (IPREM, convocatoria, empadronamiento, larga
duración…).

---

## 5. Il motore: semantica esatta

Questa sezione dice come si valuta **una** scheda per un profilo. La funzione che
l'interfaccia chiama è `evaluar(catalogo, perfil, hoy)`: firma, forma dell'uscita, ordine ed
esempi sono nella sezione **«Contrato de evaluar()»** subito dopo §5.6, che prevale se c'è un
dubbio sulla forma dell'uscita. Nessun effetto collaterale, nessuna rete.

### 5.1 Leggere un campo

1. Se `campo` comincia con `calc.`, si calcola come in §3.
2. Altrimenti si segue il percorso puntato nel profilo. Se manca un pezzo del percorso, il
   valore **manca**.
3. Il valore **manca** anche se è un codice indeterminato (§2.3), se è `null`, o se non è
   del tipo atteso (§5.6).
4. Liste: la lista intera `"no_lo_se"` manca; una lista che **contiene** un indeterminato
   è «incompleta» (vedi gli operatori di lista).

### 5.2 Un valore che manca

Qualunque operatore su un valore che manca dà `falta_dato`, motivo `falta`, domanda = il
campo da chiedere (§5.5). Nessuna eccezione, nemmeno per `!=` e `not_in`.

### 5.3 Gli operatori

**Numeri** (tutti i `calc.*` e gli interi del profilo; valore `[lo, hi]`, soglia `v`):

| op | `cumple` se | `no_cumple` se | altrimenti |
|---|---|---|---|
| `<=` | `hi ≤ v` | `lo > v` | `falta_dato` |
| `<` | `hi < v` | `lo ≥ v` | `falta_dato` |
| `>=` | `lo ≥ v` | `hi < v` | `falta_dato` |
| `>` | `lo > v` | `hi ≤ v` | `falta_dato` |
| `==` | `lo = hi = v` | `v < lo` o `v > hi` | `falta_dato` |
| `!=` | `v < lo` o `v > hi` | `lo = hi = v` | `falta_dato` |

Il `falta_dato` di questa tabella ha motivo `rango` (il dato c'è ma è troppo largo).

**Date** (campi data parziale; valore `[prima(F), ultima(F)]`, `valor` = data completa):
`<`, `<=`, `>`, `>=` con la stessa tabella, confrontando le date. `==` e `!=` non sono
ammessi sulle date.

**Booleani**: `==` → `cumple` se uguale, `no_cumple` se diverso. `!=` al contrario.

**Enum e codici** (scalari): `==` / `in` → `cumple` se il valore è `valor` / sta in `valor`,
altrimenti `no_cumple`. `!=` / `not_in` → il contrario. Confronto esatto, maiuscole
comprese.

**Liste** (valore `L`, eventualmente incompleta):

| op | `cumple` | `no_cumple` | `falta_dato` |
|---|---|---|---|
| `contains` (`valor` scalare) | `valor ∈ L` | `valor ∉ L` e `L` completa | `valor ∉ L` e `L` incompleta |
| `not_contains` (scalare) | `valor ∉ L` e `L` completa | `valor ∈ L` | `valor ∉ L` e `L` incompleta |
| `contains_any` (lista) | `L ∩ valor ≠ ∅` | `L ∩ valor = ∅` e `L` completa | `L ∩ valor = ∅` e `L` incompleta |
| `contains_none` (lista) | `L ∩ valor = ∅` e `L` completa | `L ∩ valor ≠ ∅` | `L ∩ valor = ∅` e `L` incompleta |

`[]` è una lista completa e vuota (es. «non ho cotizzato all'estero»).

`valor_grupo`: il motore sostituisce `catalogo.grupos_paises[nome]` prima di valutare. Un
gruppo che non esiste rende la regola non valida (§5.6).

### 5.4 Combinare

Ordine: `no_cumple` < `falta_dato` < `cumple`.

- `requisitos` (la scheda) e `all_of`: il **minimo** dei figli. Una lista vuota non dà mai
  `cumple`: `requisitos: []` in una scheda non informativa vale `falta_dato` con motivo
  `regla_no_valida` (§5.6), e un `all_of` vuoto è un gruppo non valido.
- `any_of`: il **massimo** dei figli.
- `no_concluyente` si applica alla regola **prima** di combinarla.
- Si valutano **tutti** i nodi (niente corto circuito): servono tutti i perché.

Quindi: un solo `no_cumple` in un AND dà «No encaja» anche se altri dati mancano; un solo
`cumple` in un `any_of` basta anche se le altre alternative mancano.

### 5.5 Le domande (`faltan`)

La forma dell'uscita è nella sezione «Contrato de evaluar()». Qui: quale domanda nasce da una
regola che esce `falta_dato`.

- `resultado` di una regola o di un gruppo: `cumple` | `falta_dato` | `no_cumple`.
- `motivo`: `null` se `cumple` o `no_cumple`; con `falta_dato` uno fra `falta`, `rango`,
  `depende_del_dia`, `no_concluyente`, `dato_no_valido`, `regla_no_valida`.
- `faltan` di una regola: le domande che la risolverebbero, **solo** se è `falta_dato`; per
  un gruppo, l'unione di quelle dei figli `falta_dato`, nell'ordine.
- `faltan` della scheda: l'unione senza ripetizioni, **solo** se la scheda è `falta_dato`
  (con «No encaja» rispondere non cambierebbe niente).

Che domanda fare (sono percorsi del profilo; l'interfaccia li mappa sulle sue schermate):

| campo della regola | dato mancante | dato troppo largo (`rango`) |
|---|---|---|
| campo del profilo | quel campo | quel campo (con una data: «precisa la fecha») |
| `calc.edad` | `persona.anio_nacimiento` | `persona.mes_nacimiento` se manca; se il mese c'è già, nessuna domanda e motivo `depende_del_dia` |
| `calc.*_residencia_legal` | `situacion_administrativa.residencia_legal_desde` | lo stesso campo (più preciso); con data completa non succede |
| `calc.*_empadronado` | `residencia.empadronado_desde` | idem |
| `calc.num_hijos`, `calc.hijos_menores_*` | `hogar.hijos` | `hogar.hijos` (anno o mese dei figli) |
| `calc.ingresos_individuales` | `ingresos.individual.tramo` | `ingresos.individual.importe` |
| `calc.ingresos_hogar` | `ingresos.hogar.tramo` | `ingresos.hogar.importe` (o `ingresos.individual.importe` se viene da lì) |
| `calc.ingresos_hogar_por_miembro` | `hogar.miembros` se manca, più la domanda di `calc.ingresos_hogar` se manca quello | `ingresos.hogar.importe` (o `ingresos.individual.importe` se viene da lì) |
| `calc.patrimonio_sin_vivienda` | `ingresos.patrimonio_sin_vivienda.tramo` | `ingresos.patrimonio_sin_vivienda.importe` |

Con motivo `no_concluyente`, `dato_no_valido` (domanda = il campo da correggere) o
`regla_no_valida` (nessuna domanda) la riga si comporta come scritto in §5.6 e §6.2.

### 5.6 Errori e tipi sbagliati

- **Nel profilo** (succede con file caricati a mano): un valore del tipo sbagliato
  (`"1998"` dove serve un intero), una data impossibile o nel futuro dove non può esserlo
  (nascita, `*_desde`), un tramo inesistente: il valore conta come mancante, motivo
  `dato_no_valido`, domanda = quel campo. Al caricamento l'interfaccia valida il file con
  lo schema, **scarta solo i campi non validi**, tiene il resto e dice quali ha scartato
  («No hemos podido leer estos datos: …»).
- **Nel catalogo**: una regola che lo schema avrebbe rifiutato (campo sconosciuto,
  operatore non ammesso, `valor` del tipo sbagliato, gruppo inesistente) non deve arrivare
  al sito: la build si ferma (§7). Se arriva lo stesso, la regola vale `falta_dato` con
  motivo `regla_no_valida`, l'interfaccia scrive «No hemos podido comprobar este requisito:
  léelo en la fuente», e la console registra l'errore. Mai `no_cumple`, mai nascondere la
  scheda. Lo stesso vale per `requisitos` che non è una lista, e per `requisitos: []` in una
  scheda che non è `informativa`: la scheda ha una riga sola, «Requisitos de esta ficha»,
  `falta_dato` con motivo `regla_no_valida`, mai `encaja`.

---

## Contrato de evaluar()

Questa sezione basta per scrivere l'interfaccia **senza leggere il motore**, e il motore
senza sapere niente dell'interfaccia. Il motore (L1) la implementa in `web/js/motor.js`;
l'interfaccia (L2) la importa (fino ad allora da uno stub con la stessa firma). Chi trova un
caso che qui non è deciso non lo inventa: lo chiede al coordinatore.

### Firma

```js
import { evaluar } from "./motor.js";
const resultado = evaluar(catalogo, perfil, hoy);
```

| argomento | tipo | note |
|---|---|---|
| `catalogo` | l'oggetto di `web/data/catalogo.json` (§4.1), così com'è | il motore usa `fichas` e `grupos_paises` e non lo modifica |
| `perfil` | un profilo v1.1 (§2), anche vuoto (`{}` o solo `esquema` e `version`) | non lo modifica; un campo non valido vale come mancante (§5.6) |
| `hoy` | stringa `"AAAA-MM-DD"` | la data locale del browser; nei test una data fissa |

La funzione è **pura e sincrona**: niente DOM, niente rete, niente `Date.now()` né
`console.log` dentro; per dati strani del profilo o del catalogo non lancia eccezioni (il
problema diventa `falta_dato`, §5.6). Stesso input, stessa uscita, anche nell'ordine.

Il modulo esporta anche `AREAS`: l'elenco congelato delle 12 aree di §4.2 nell'ordine in cui
l'interfaccia le mostra (lo stesso dell'enum dello schema; una prova li confronta).

### Uscita

```json
{
  "hoy": "2026-10-14",
  "fichas": [ { "id": "…", "tipo": "…", "area": "…", "estado": "…", "apertura": "…",
                "por_revisar": false, "proximo_plazo": null, "razones": [], "faltan": [],
                "requisitos": [] } ],
  "informativas": [ { "id": "…", "area": "…" } ],
  "ocultas_por_territorio": 0,
  "perfil_calculado": { "calc.edad": [28, 28], "…": null }
}
```

- `hoy`: l'argomento, ricopiato.
- `fichas`: una voce per ogni scheda **non informativa** che passa il filtro di §6.4, **già in
  ordine** (sotto).
- `informativas`: una voce `{id, area}` per ogni scheda con `informativa: true` che passa il
  filtro di §6.4. **Nessun esito**: niente `estado`, `razones`, `faltan` né `requisitos`, e le
  sue regole non si leggono. Ordine: per `area` nell'ordine di §4.2 (un'area assente o
  sconosciuta vale `null` e va in fondo), poi `nombre` (`localeCompare(…, "es")`), poi `id`.
  L'interfaccia le mostra in «Otras ayudas que conviene conocer», raggruppate per area, con
  `nombre`, `resumen`, `siguiente_paso` e `ayuda_humana` presi da `catalogo.fichas`.
- `ocultas_por_territorio`: quante schede il filtro di §6.4 ha tolto (informative comprese). Se è > 0 l'interfaccia
  scrive «Hay N fichas de otros territorios que no se muestran».
- `perfil_calculado`: **tutte e tredici** le chiavi `calc.*` della tabella di §4.3, in
  quell'ordine. Valore `[lo, hi]` (numeri; `hi` è `null` quando non c'è limite superiore, per
  esempio con il tramo `mas_de_70000`) oppure `null` se il dato manca o non è valido. Serve
  al riepilogo «Tu perfil» e ai test.

Ogni voce di `fichas`:

| campo | tipo | significato |
|---|---|---|
| `id` | stringa | l'`id` della scheda. Tutto il resto da mostrare (`nombre`, `cuantia`, `plazo`, `siguiente_paso`, `ayuda_humana`, `fuente`, `leido_por_agente`, `verificado_el`, `requisitos_no_evaluables`, `compatibilidad`, `solicita`) l'interfaccia lo prende da `catalogo.fichas` con questo `id` |
| `tipo` | `"derecho"` \| `"oportunidad"` | copiato dalla scheda: gruppi «Derechos» e «Oportunidades» |
| `area` | stringa di §4.2 o `null` | copiata dalla scheda (`null` se manca o non è fra le 12): per raggruppare e filtrare i risultati per area. Non cambia né l'esito né l'ordine |
| `estado` | `"encaja"` \| `"falta_dato"` \| `"no_encaja"` | l'esito della scheda (§5.4: `cumple` → `encaja`, `no_cumple` → `no_encaja`). A schermo: «Parece que encajas», «Te falta un dato», «No encaja» |
| `apertura` | `"abierta"` \| `"cerrada"` \| `"por_abrir"` \| `"desconocida"` | dal `plazo` e da `hoy` (tabella sotto). **Non cambia mai `estado`** |
| `por_revisar` | booleano | `hoy > revisar_antes_de` (§6.5) |
| `proximo_plazo` | `"AAAA-MM-DD"` o `null` | `plazo.fin` se `plazo.tipo == "fechas"` e `hoy ≤ plazo.fin`; altrimenti `null` |
| `razones` | lista di testi | i `texto` dei requisiti di **primo livello** che decidono l'esito, nell'ordine della scheda: con `encaja` tutti; con `falta_dato` quelli `falta_dato`; con `no_encaja` quelli `no_cumple`. Mai vuota: una scheda non informativa senza requisiti ha la riga «Requisitos de esta ficha» (§5.6) |
| `faltan` | lista di percorsi del profilo | le domande che possono cambiare l'esito (§5.5), senza ripetizioni, nell'ordine dei requisiti. È **sempre `[]` se `estado` non è `falta_dato`**. Può essere `[]` anche con `falta_dato`: succede quando il dato c'è ma non basta (`no_concluyente`, `depende_del_dia`, `regla_no_valida`); allora l'interfaccia non fa domande, mostra l'`aclaracion` e rinvia alla `fuente` e all'aiuto umano |
| `requisitos` | lista | un elemento per ogni requisito di **primo livello** della scheda, nello stesso ordine (un gruppo `any_of`/`all_of` è una riga sola, col suo `texto`) |

Un elemento di `requisitos`:

| campo | tipo | significato |
|---|---|---|
| `texto` | stringa | il `texto` della regola o del gruppo |
| `resultado` | `"cumple"` \| `"falta_dato"` \| `"no_cumple"` | codice interno della riga, mai a schermo. A schermo (§6.1): «Sí, según lo que has dicho», «Falta un dato: {domanda}», «No, según lo que has dicho» |
| `motivo` | `null` o `"falta"`, `"rango"`, `"depende_del_dia"`, `"no_concluyente"`, `"dato_no_valido"`, `"regla_no_valida"` | `null` se `resultado` non è `falta_dato`. Per un gruppo: il motivo del primo figlio che ha lo stesso `resultado` del gruppo |
| `aclaracion` | stringa o `null` | con `motivo == "no_concluyente"` l'`aclaracion` della regola (o `null` se la regola non ne ha); con `"regla_no_valida"` il testo «No hemos podido comprobar este requisito: léelo en la fuente.»; altrimenti `null` |
| `faltan` | lista di percorsi | le domande di questa riga (§5.5); `[]` se `resultado` non è `falta_dato` |

I percorsi che possono comparire in `faltan` sono **questi 47 e nessun altro** (per ognuno
l'interfaccia ha una domanda). Sono i campi del profilo che una regola può leggere (§4.3, senza
i `calc.*`) più quelli che §5.5 chiede al posto dei `calc.*`:

- `persona`: `persona.anio_nacimiento`, `persona.mes_nacimiento`, `persona.sexo`,
  `persona.nacionalidades`
- `situacion_administrativa`: `situacion_administrativa.tipo`,
  `situacion_administrativa.residencia_legal_desde`, `situacion_administrativa.documento_desde`,
  `situacion_administrativa.documento_hasta`, `situacion_administrativa.autoriza_trabajar`
- `residencia`: `residencia.pais`, `residencia.region`, `residencia.provincia`,
  `residencia.municipio_ine`, `residencia.empadronado_desde`
- `hogar`: `hogar.miembros`, `hogar.hijos`, `hogar.monoparental`, `hogar.pareja`,
  `hogar.familia_numerosa`
- `vivienda`: `vivienda.regimen`, `vivienda.alquiler_mensual`, `vivienda.contrato_a_su_nombre`
- `ingresos`: `ingresos.individual.tramo`, `ingresos.individual.importe`,
  `ingresos.hogar.tramo`, `ingresos.hogar.importe`, `ingresos.patrimonio_sin_vivienda.tramo`,
  `ingresos.patrimonio_sin_vivienda.importe`
- `empleo`: `empleo.situaciones`, `empleo.tipo_contrato`, `empleo.contrato_hasta`,
  `empleo.meses_cotizados_6_anios`, `empleo.inscrito_demandante`, `empleo.cobra_prestacion`
- `estudios`: `estudios.nivel_max`, `estudios.matriculado_en`, `estudios.titulo_extranjero`,
  `estudios.titulo_pais`, `estudios.homologacion`
- `vinculos`: `vinculos.entidad_trabajo.tipo`, `vinculos.entidad_trabajo.ambito`,
  `vinculos.entidad_estudios.tipo`, `vinculos.entidad_estudios.ambito`,
  `vinculos.permiso_conducir_pais`, `vinculos.paises_origen`, `vinculos.paises_cotizacion`,
  `vinculos.afiliaciones`

Se lo schema aggiunge un campo a §4.3, questa lista cambia con lui (e con la versione).

### Schede informative: un esempio

`catalogo` = le tre schede d'esempio (sotto, «Tre esempi») più due schede informative di prova
di `tests/fichas/`: `es-vc-prueba-informativa-cuidados` (`area: salud_cuidados`, `ambito`
`ES-VC`, `requisitos: []`) e `es-prueba-informativa-familia` (`area: familia`, `ambito` `ES`, una
regola su `calc.num_hijos` che il motore **non legge**, `plazo.mes_habitual: 3`).
`evaluar(catalogo, perfilLucia, "2026-10-14")` dà le stesse tre voci di `fichas`
dell'Esempio 1 e:

```json
{
  "informativas": [
    { "id": "es-prueba-informativa-familia", "area": "familia" },
    { "id": "es-vc-prueba-informativa-cuidados", "area": "salud_cuidados" }
  ],
  "ocultas_por_territorio": 0
}
```

`familia` viene prima di `salud_cuidados` per l'ordine delle aree di §4.2, non per l'ordine
alfabetico. Lucía non ha figli, ma la scheda di famiglia non diventa «No encaja»: non ha esito.
Chi vive in Francia non vede nessuna delle due (filtro di §6.4) e le conta in
`ocultas_por_territorio`.

### `apertura`

| `plazo.tipo` | `apertura` |
|---|---|
| `abierto_todo_el_ano` | `"abierta"` |
| `fechas` | `"por_abrir"` se c'è `inicio` e `hoy < inicio`; altrimenti `"abierta"` se `hoy ≤ fin`; `"cerrada"` se `hoy > fin` |
| `cerrado` | `"cerrada"` |
| `convocatoria_anual`, `desconocido` | `"desconocida"` |

Le date si confrontano come stringhe `AAAA-MM-DD` (è lo stesso ordine delle date); gli
estremi sono inclusi.

### Ordine di `fichas`

L'array esce già ordinato: l'interfaccia raggruppa ma **non riordina**. La chiave, un criterio
dopo l'altro:

1. `apertura == "cerrada"` va in fondo (il gruppo «Cerradas ahora»); tutto il resto prima.
2. `tipo`: `derecho` prima di `oportunidad`.
3. `estado`: `encaja`, poi `falta_dato`, poi `no_encaja`.
4. scadenza: prima le voci con `proximo_plazo` (la più vicina in cima), poi quelle senza.
5. `nombre` della scheda in ordine alfabetico spagnolo (`a.localeCompare(b, "es")`), poi `id`.

Per le tre sezioni dei risultati l'interfaccia filtra l'array senza cambiarne l'ordine:
«Derechos» = `apertura != "cerrada"` e `tipo == "derecho"`; «Oportunidades» =
`apertura != "cerrada"` e `tipo == "oportunidad"`; «Cerradas ahora» = `apertura ==
"cerrada"`. «Cambios con fecha» in home = le voci con `proximo_plazo` entro 60 giorni da
`hoy`.

### Tre esempi

`catalogo` è quello segnaposto (`python3 scripts/construir.py --ejemplo` →
`web/data/catalogo.json`), con le tre schede di `schema/esempi/fichas/` (§9):
`es-sepe-prestacion-contributiva-desempleo` (derecho, aperta tutto l'anno),
`es-aei-fpu-2026` (oportunidad, `fechas` 20/10-12/11/2026, `revisar_antes_de` 2026-11-13),
`es-vc-bono-alquiler-joven-2026` (oportunidad, `cerrado`); paro e Bono hanno
`revisar_antes_de` 2027-01-12. Gli esempi sono anche test del motore.

**Debito aperto (L20).** Dalla versione 1.1 `area` è obbligatoria, ma i tre file di
`schema/esempi/fichas/` non l'hanno ancora: finché un lotto non la aggiunge (`empleo`,
`investigacion`, `vivienda`, come nelle copie di `tests/fichas/`), `construir.py --ejemplo` e
`validar.py schema/esempi/fichas` sono rossi e il catalogo segnaposto non si può costruire. Gli
esempi qui sotto mostrano l'`area` che quelle schede avranno; il test li riproduce prendendo
l'area dalle copie in `tests/fichas/` (rattoppo dichiarato in `tests/motor.test.mjs`) e una prova
`todo` in `tests/validar.test.mjs` resta fallita finché il debito non si chiude.

**Esempio 1 — Lucía oggi.** `evaluar(catalogo, perfilLucia, "2026-10-14")` con
`schema/esempi/perfil-lucia.json`:

```json
{
  "hoy": "2026-10-14",
  "fichas": [
    { "id": "es-sepe-prestacion-contributiva-desempleo", "tipo": "derecho", "area": "empleo",
      "estado": "no_encaja", "apertura": "abierta", "por_revisar": false, "proximo_plazo": null,
      "razones": ["Estar sin trabajo (en situación legal de desempleo)"],
      "faltan": [],
      "requisitos": [
        { "texto": "Estar sin trabajo (en situación legal de desempleo)", "resultado": "no_cumple", "motivo": null, "aclaracion": null, "faltan": [] },
        { "texto": "Haber cotizado por desempleo al menos 360 días en los últimos 6 años", "resultado": "cumple", "motivo": null, "aclaracion": null, "faltan": [] }
      ] },
    { "id": "es-aei-fpu-2026", "tipo": "oportunidad", "area": "investigacion",
      "estado": "falta_dato", "apertura": "por_abrir", "por_revisar": false, "proximo_plazo": "2026-11-12",
      "razones": ["No tener ahora un contrato predoctoral (si lo tienes, cuentan los meses que llevas)"],
      "faltan": [],
      "requisitos": [
        { "texto": "Tener un grado o un máster y no tener el doctorado", "resultado": "cumple", "motivo": null, "aclaracion": null, "faltan": [] },
        { "texto": "No tener ahora un contrato predoctoral (si lo tienes, cuentan los meses que llevas)", "resultado": "falta_dato", "motivo": "no_concluyente", "aclaracion": "Con un contrato predoctoral ahora depende de los meses: las bases no admiten haber tenido más de 12 meses de contrato predoctoral antes de la solicitud.", "faltan": [] }
      ] },
    { "id": "es-vc-bono-alquiler-joven-2026", "tipo": "oportunidad", "area": "vivienda",
      "estado": "encaja", "apertura": "cerrada", "por_revisar": false, "proximo_plazo": null,
      "razones": ["Tener 35 años o menos al pedirla",
                  "Tener la nacionalidad española o de la UE, o estancia o residencia legal en España",
                  "Vivir en la Comunitat Valenciana",
                  "Vivir de alquiler (vivienda o habitación) en tu residencia habitual"],
      "faltan": [],
      "requisitos": [
        { "texto": "Tener 35 años o menos al pedirla", "resultado": "cumple", "motivo": null, "aclaracion": null, "faltan": [] },
        { "texto": "Tener la nacionalidad española o de la UE, o estancia o residencia legal en España", "resultado": "cumple", "motivo": null, "aclaracion": null, "faltan": [] },
        { "texto": "Vivir en la Comunitat Valenciana", "resultado": "cumple", "motivo": null, "aclaracion": null, "faltan": [] },
        { "texto": "Vivir de alquiler (vivienda o habitación) en tu residencia habitual", "resultado": "cumple", "motivo": null, "aclaracion": null, "faltan": [] }
      ] }
  ],
  "informativas": [],
  "ocultas_por_territorio": 0,
  "perfil_calculado": {
    "calc.edad": [28, 28], "calc.anios_residencia_legal": [3, 3], "calc.meses_residencia_legal": [36, 37],
    "calc.anios_empadronado": [3, 3], "calc.meses_empadronado": [36, 37], "calc.num_hijos": [0, 0],
    "calc.hijos_menores_3": [0, 0], "calc.hijos_menores_18": [0, 0], "calc.hijos_menores_25": [0, 0],
    "calc.ingresos_individuales": [18001, 21000], "calc.ingresos_hogar": [18001, 21000],
    "calc.ingresos_hogar_por_miembro": [18001, 21000], "calc.patrimonio_sin_vivienda": [1, 6000]
  }
}
```

Da notare: il paro è «No encaja» perché la lista `empleo.situaciones` di Lucía è completa e
non contiene `desempleado`; la FPU è «Te falta un dato» **senza domande** (`faltan: []`)
perché la regola sul contratto predoctoral è `no_concluyente`: l'interfaccia mostra
l'`aclaracion`. La regola controlla solo il contratto **di adesso**: il limite dei 12 mesi
già goduti sta in `requisitos_no_evaluables`, e per chi ha un altro contratto la riga dice
«Sí» solo su quello che dice il suo `texto`; il Bono è «Parece que encajas» ma sta in fondo perché è chiuso (`apertura:
"cerrada"`), e resta «encaja» lo stesso. `calc.ingresos_hogar` viene dall'individuale perché
`hogar.miembros` è 1 e manca `ingresos.hogar` (§3.2).

**Esempio 2 — profilo vuoto.** `evaluar(catalogo, {"esquema": "tamiz-perfil", "version":
1.1}, "2026-10-14")`. Nessuna scheda è nascosta dal territorio (paese e regione mancano,
§6.4); tutto è `falta_dato` con motivo `falta`, e ogni riga chiede il suo campo:

```json
{
  "hoy": "2026-10-14",
  "fichas": [
    { "id": "es-sepe-prestacion-contributiva-desempleo", "tipo": "derecho", "area": "empleo",
      "estado": "falta_dato", "apertura": "abierta", "por_revisar": false, "proximo_plazo": null,
      "razones": ["Estar sin trabajo (en situación legal de desempleo)",
                  "Haber cotizado por desempleo al menos 360 días en los últimos 6 años"],
      "faltan": ["empleo.situaciones", "empleo.meses_cotizados_6_anios"],
      "requisitos": [
        { "texto": "Estar sin trabajo (en situación legal de desempleo)", "resultado": "falta_dato", "motivo": "falta", "aclaracion": null, "faltan": ["empleo.situaciones"] },
        { "texto": "Haber cotizado por desempleo al menos 360 días en los últimos 6 años", "resultado": "falta_dato", "motivo": "falta", "aclaracion": null, "faltan": ["empleo.meses_cotizados_6_anios"] }
      ] },
    { "id": "es-aei-fpu-2026", "tipo": "oportunidad", "area": "investigacion",
      "estado": "falta_dato", "apertura": "por_abrir", "por_revisar": false, "proximo_plazo": "2026-11-12",
      "razones": ["Tener un grado o un máster y no tener el doctorado",
                  "No tener ahora un contrato predoctoral (si lo tienes, cuentan los meses que llevas)"],
      "faltan": ["estudios.nivel_max", "empleo.tipo_contrato"],
      "requisitos": [
        { "texto": "Tener un grado o un máster y no tener el doctorado", "resultado": "falta_dato", "motivo": "falta", "aclaracion": null, "faltan": ["estudios.nivel_max"] },
        { "texto": "No tener ahora un contrato predoctoral (si lo tienes, cuentan los meses que llevas)", "resultado": "falta_dato", "motivo": "falta", "aclaracion": null, "faltan": ["empleo.tipo_contrato"] }
      ] },
    { "id": "es-vc-bono-alquiler-joven-2026", "tipo": "oportunidad", "area": "vivienda",
      "estado": "falta_dato", "apertura": "cerrada", "por_revisar": false, "proximo_plazo": null,
      "razones": ["Tener 35 años o menos al pedirla",
                  "Tener la nacionalidad española o de la UE, o estancia o residencia legal en España",
                  "Vivir en la Comunitat Valenciana",
                  "Vivir de alquiler (vivienda o habitación) en tu residencia habitual"],
      "faltan": ["persona.anio_nacimiento", "situacion_administrativa.tipo", "residencia.region", "vivienda.regimen"],
      "requisitos": [
        { "texto": "Tener 35 años o menos al pedirla", "resultado": "falta_dato", "motivo": "falta", "aclaracion": null, "faltan": ["persona.anio_nacimiento"] },
        { "texto": "Tener la nacionalidad española o de la UE, o estancia o residencia legal en España", "resultado": "falta_dato", "motivo": "falta", "aclaracion": null, "faltan": ["situacion_administrativa.tipo"] },
        { "texto": "Vivir en la Comunitat Valenciana", "resultado": "falta_dato", "motivo": "falta", "aclaracion": null, "faltan": ["residencia.region"] },
        { "texto": "Vivir de alquiler (vivienda o habitación) en tu residencia habitual", "resultado": "falta_dato", "motivo": "falta", "aclaracion": null, "faltan": ["vivienda.regimen"] }
      ] }
  ],
  "informativas": [],
  "ocultas_por_territorio": 0,
  "perfil_calculado": {
    "calc.edad": null, "calc.anios_residencia_legal": null, "calc.meses_residencia_legal": null,
    "calc.anios_empadronado": null, "calc.meses_empadronado": null, "calc.num_hijos": null,
    "calc.hijos_menores_3": null, "calc.hijos_menores_18": null, "calc.hijos_menores_25": null,
    "calc.ingresos_individuales": null, "calc.ingresos_hogar": null,
    "calc.ingresos_hogar_por_miembro": null, "calc.patrimonio_sin_vivienda": null
  }
}
```

Da notare: la FPU chiede `empleo.tipo_contrato` (motivo `falta`): `no_concluyente` cambia
solo un esito `cumple`/`no_cumple`, mai un dato che manca. Zero «encaja» (principio 2).

**Esempio 3 — Rodrigo fra tre mesi.** `evaluar(catalogo, perfilRodrigo, "2027-01-15")` con
`schema/esempi/perfil-rodrigo.json`. Ora tutte e tre le schede sono `por_revisar` (la data di
oggi supera `revisar_antes_de`), la FPU è chiusa, e l'età di Rodrigo (nato nel 1991, mese
sconosciuto) è `[35, 36]`: per «35 años o menos» serve il mese.

```json
{
  "hoy": "2027-01-15",
  "fichas": [
    { "id": "es-sepe-prestacion-contributiva-desempleo", "tipo": "derecho", "area": "empleo",
      "estado": "no_encaja", "apertura": "abierta", "por_revisar": true, "proximo_plazo": null,
      "razones": ["Estar sin trabajo (en situación legal de desempleo)"],
      "faltan": [],
      "requisitos": [
        { "texto": "Estar sin trabajo (en situación legal de desempleo)", "resultado": "no_cumple", "motivo": null, "aclaracion": null, "faltan": [] },
        { "texto": "Haber cotizado por desempleo al menos 360 días en los últimos 6 años", "resultado": "falta_dato", "motivo": "falta", "aclaracion": null, "faltan": ["empleo.meses_cotizados_6_anios"] }
      ] },
    { "id": "es-vc-bono-alquiler-joven-2026", "tipo": "oportunidad", "area": "vivienda",
      "estado": "falta_dato", "apertura": "cerrada", "por_revisar": true, "proximo_plazo": null,
      "razones": ["Tener 35 años o menos al pedirla"],
      "faltan": ["persona.mes_nacimiento"],
      "requisitos": [
        { "texto": "Tener 35 años o menos al pedirla", "resultado": "falta_dato", "motivo": "rango", "aclaracion": null, "faltan": ["persona.mes_nacimiento"] },
        { "texto": "Tener la nacionalidad española o de la UE, o estancia o residencia legal en España", "resultado": "cumple", "motivo": null, "aclaracion": null, "faltan": [] },
        { "texto": "Vivir en la Comunitat Valenciana", "resultado": "cumple", "motivo": null, "aclaracion": null, "faltan": [] },
        { "texto": "Vivir de alquiler (vivienda o habitación) en tu residencia habitual", "resultado": "cumple", "motivo": null, "aclaracion": null, "faltan": [] }
      ] },
    { "id": "es-aei-fpu-2026", "tipo": "oportunidad", "area": "investigacion",
      "estado": "no_encaja", "apertura": "cerrada", "por_revisar": true, "proximo_plazo": null,
      "razones": ["Tener un grado o un máster y no tener el doctorado"],
      "faltan": [],
      "requisitos": [
        { "texto": "Tener un grado o un máster y no tener el doctorado", "resultado": "no_cumple", "motivo": null, "aclaracion": null, "faltan": [] },
        { "texto": "No tener ahora un contrato predoctoral (si lo tienes, cuentan los meses que llevas)", "resultado": "falta_dato", "motivo": "falta", "aclaracion": null, "faltan": ["empleo.tipo_contrato"] }
      ] }
  ],
  "informativas": [],
  "ocultas_por_territorio": 0,
  "perfil_calculado": {
    "calc.edad": [35, 36], "calc.anios_residencia_legal": [5, 5], "calc.meses_residencia_legal": [66, 67],
    "calc.anios_empadronado": [7, 8], "calc.meses_empadronado": [84, 96], "calc.num_hijos": null,
    "calc.hijos_menores_3": null, "calc.hijos_menores_18": null, "calc.hijos_menores_25": null,
    "calc.ingresos_individuales": null, "calc.ingresos_hogar": null,
    "calc.ingresos_hogar_por_miembro": null, "calc.patrimonio_sin_vivienda": null
  }
}
```

Da notare: «No encaja» vince su un dato mancante nella stessa scheda (paro, FPU: un
`no_cumple` in un AND basta, §5.4), e allora `faltan` della scheda è `[]` anche se una riga ha
la sua domanda. Fra le chiuse il Bono (`falta_dato`) viene prima della FPU (`no_encaja`):
criterio 3 dell'ordine. `tipo_contrato: "no_lo_se"` vale come mancante (§2.3).

---

## 6. Interfaccia: le regole che vengono dallo schema

### 6.1 Le parole

| esito | scheda | riga di una regola |
|---|---|---|
| `cumple` | **Parece que encajas** | Sí, según lo que has dicho |
| `falta_dato` | **Te falta un dato** | Falta un dato: {la domanda, cliccabile} |
| `no_cumple` | **No encaja** | No, según lo que has dicho |

Titolo dei risultati: «Lo que parece encajar contigo». Vietate in qualunque testo
dell'interfaccia: «cumples», «cumple», «te toca», «tienes derecho». `scripts/validar.py`
rifiuta un catalogo, una scheda o un profilo che contiene «cumples», «te toca» o «tienes
derecho» in un testo, comprese le forme vicine («te tocará», «te tocan», «tienes todo el
derecho», «tienes derechos»). Il numero di dati
mancanti si può mostrare accanto («Te falta un dato · 2 preguntas»), ma l'etichetta resta
quella.

### 6.2 Cosa mostra ogni esito

- «Parece que encajas»: tutte le regole con la loro riga, poi «Además, comprueba en las
  bases:» con `requisitos_no_evaluables`.
- «Te falta un dato»: prima le domande (`faltan`), cliccabili; poi le regole. Una
  regola `no_concluyente` mostra `aclaracion` e rimanda alla `fuente` e all'aiuto umano.
- «No encaja»: solo le regole `no_cumple`, con il loro `texto` («Tener 35 años o menos —
  No, según lo que has dicho»).
- Le schede `informativas` (nessun esito): in fondo, sotto «Otras ayudas que conviene
  conocer», raggruppate per area, con `resumen`, `siguiente_paso` e `ayuda_humana`; mai
  un'etichetta di esito.

### 6.3 Ordine

L'ordine lo decide il motore (sezione «Contrato de evaluar()», «Ordine di `fichas`»): le
chiuse in fondo, prima `derecho` («Derechos») poi `oportunidad` («Oportunidades»), dentro
ogni gruppo «Parece que encajas», «Te falta un dato», «No encaja», poi le scadenze più vicine,
poi `nombre`. Gli `intereses` non cambiano né l'esito né l'ordine.

### 6.4 Quali schede si vedono

Si mostra una scheda se:

- `ambito` è `EU`; oppure
- `ambito` è un paese (`ES`) e `residencia.pais` è uguale o manca; oppure
- `ambito` è una regione (`ES-VC`) e `residencia.region` è uguale, oppure
  `residencia.region` manca e `residencia.pais` è il prefisso dell'ambito (`ES`) o manca.

Le altre non si mostrano; una riga dice «Hay N fichas de otros territorios que no se
muestran». Questo è solo un filtro: l'esito resta quello delle
regole, e ogni scheda territoriale deve avere la sua regola di residenza.

### 6.5 «Por revisar»

Ogni scheda mostra sempre due righe: «Leído por IA el {leido_por_agente}» e, se
`verificado_el` è `null`, «Revisado por una persona: todavía no», altrimenti «Revisado por una
persona el {verificado_el}». Se `por_revisar` è `true` (`hoy > revisar_antes_de`), in più il
badge «Por revisar» e le due righe in evidenza. L'esito si calcola lo stesso; l'ICS no.

Finché `catalogo.revision_humana.completa` è `false` (e `redactado_con_ia` è `true`), la home
mostra «Fichas redactadas con IA, sin revisión humana todavía».

### 6.6 ICS

Il calendario è un file statico, `web/calendario.ics`, generato al build da
`scripts/ics.py` (lotto L4), non nel browser. Ci entra una scheda solo se **tutto** vale:
`plazo.tipo == "fechas"`, `plazo.verificado == true` (quindi con `plazo.fuente`), `plazo.fin
≥` il giorno del build. Un evento di giornata intera il giorno `fin` e, se `inicio` è nel
futuro, uno il giorno `inicio`; titolo generico, senza nessun dato della persona; `UID` =
`{id}-{fin}@tamiz`; il nome del calendario da `sitio.json`. L'interfaccia mostra «Añadir a mi
calendario» (link a `calendario.ics`) solo se almeno una scheda del catalogo ha
`plazo.verificado == true` e `proximo_plazo` non `null`; altrimenti il pulsante non esiste.

### 6.7 Compatibilità

`declarada_en_bases: false` → «Compatibilidad no verificada». `true` → il `texto` e il link
alla `fuente`. Sulla scheda B citata da A si mostra anche «Según las bases de {A.nombre}:
{A.compatibilidad.texto}». Nessuna frase di compatibilità senza bases.

### 6.8 Il nome del sito

L'interfaccia scrive il nome e il sottotitolo **solo** da `catalogo.sitio.nombre` e
`catalogo.sitio.lema` (che `construir.py` copia da `sitio.json`, l'unico posto in cui il nome
sta). Nessun file HTML, JS o CSS contiene il nome scritto a mano, così cambiarlo è cambiare
una riga di `sitio.json` e rifare il build.

---

## 7. Controlli della build (oltre al JSON Schema)

Due script, solo libreria standard di Python. `validar.py` usa `jsonschema` se il Python che lo
esegue lo ha (per esempio quello di `.venv` nella cartella del progetto); senza, un validatore
interno minimo, e lo scrive nella prima riga dell'uscita.

**`scripts/validar.py [file o cartella …]`** (senza argomenti: `web/data/catalogo.json` e i
due profili d'esempio). Riconosce dal contenuto catalogo, profilo, scheda sola, elenco
`ayuda_humana`, glosario. Ogni errore è una riga `ERRORE  <file> · ficha <id> · campo
<campo>: <cosa>`; exit code 1 se c'è almeno un errore. Controlla:

1. Catalogo valido contro `catalogo.schema.json`; profili validi contro
   `perfil.schema.json`; una scheda sola contro `#/$defs/ficha`.
2. `id` unici fra le schede e fra gli `ayuda_humana`.
3. Ogni id in `compatibilidad.*_con` e in `ficha.ayuda_humana` esiste nel catalogo; nessuna
   scheda cita se stessa.
4. Ogni `valor_grupo` esiste in `grupos_paises`.
5. Date vere (non `2026-02-30`); `revisar_antes_de` **dopo** `leido_por_agente`;
   `verificado_el ≤ revisar_antes_de` se c'è; in `plazo`, `inicio ≤ fin`.
6. `confianza == "alta"` e niente `_revisar` per ogni scheda del catalogo e per ogni file in
   una cartella `fichas/` (salvo `*-candidata.json`).
7. Nessun «cumples», «te toca», «tienes derecho» in un testo (§6.1), con le forme vicine
   (espressione: `\b(cumples|te\s+toca\w*|tienes\s+(?:\w+\s+){0,3}derechos?)\b`, senza
   distinguere maiuscole); non si guardano `id` e URL.
8. Ogni `ayuda` nelle `solicitudes` dei profili d'esempio è una scheda del catalogo validato
   nella stessa chiamata (se no, si corregge l'esempio, non il catalogo). Attenzione per L3 e
   L5: Lucía cita `es-vc-bono-alquiler-joven-2026`; se quella scheda esce dal catalogo vero
   (scende a `media`, va in `por-revisar/`), `construir.py` diventa rosso per colpa
   dell'esempio, e si corregge `schema/esempi/perfil-lucia.json` (scegliendo un'altra scheda
   del catalogo), non il controllo.
9. Avviso (non blocca): scheda con `ambito` diverso da `EU` senza nessuna regola su
   `residencia.*`.
10. `requisitos: []` solo con `informativa: true` (errore: una scheda valutabile senza regole
    darebbe «encaja» a chiunque). Avvisi (non bloccano): scheda informativa con regole (il
    motore non le legge); `plazo.mes_habitual` con `abierto_todo_el_ano`. `area` obbligatoria e
    nell'enum, `mes_habitual` intero 1-12: li controlla lo schema (punto 1).

**`scripts/construir.py [--ejemplo] [--hoy AAAA-MM-DD] [--estricto]`** fonde
`catalogo/fichas/*.json` (una scheda per file, un oggetto JSON come lo vuole `validar.py`; un
file con una lista ferma il build; si saltano i `*-candidata.json`), `catalogo/ayuda_humana.json`,
`catalogo/glosario.json` (se mancano: elenchi vuoti, e lo dice), `catalogo/grupos_paises.json`
(facoltativo) e `sitio.json` in `web/data/catalogo.json` con `actualizado_el` = `--hoy`
(default oggi), `redactado_con_ia: true` e `revision_humana.completa: false`. Una scheda non
`alta`, senza `leido_por_agente` o con `_revisar` viene **esclusa** con una riga `ESCLUSA`
e il build **continua ed esce con 0** se il resto è valido: «rifiuta» (piano L0, punto 7)
vuol dire che quella scheda non entra nel catalogo, non che il build si ferma. Con
`--estricto` invece il build si ferma con 1 e non scrive niente: è il modo da usare quando
tutte le schede di `fichas/` devono entrare (prove di L5, rilascio). Poi chiama `validar.py` sul catalogo nuovo e sui
due profili d'esempio: solo se è verde scrive `web/data/catalogo.json` e copia
`perfil-lucia.json` e `perfil-rodrigo.json` in `web/data/ejemplos/`; se è rosso non tocca
niente ed esce con 1. `--ejemplo` prende schede, `ayuda_humana` e glosario da
`schema/esempi/` (il catalogo segnaposto per l'interfaccia). Le schede si copiano così come
sono: una scheda `informativa` entra nel catalogo con il suo flag, e il messaggio finale dice
quante sono.

---

## 8. Conversione verso v1.1 (da v1 e da ESQUEMA-v0)

Il convertitore è uno script che applica queste tabelle in ordine. Quando una riga dice
«`_revisar`», il convertitore aggiunge alla lista `_revisar` della scheda la frase indicata
(con i valori v0 originali), così la scheda non si pubblica finché qualcuno non la
controlla. `_revisar` è sempre una lista di testi, mai `true`.

Chi toglie `_revisar`: una scheda con `_revisar` resta fuori dal build (§7), e §8.2 lo mette
su molte schede (ogni `subvencion`, ogni `plazo` con `fechas`, ogni compatibilità v0 non
vuota). Lo toglie **chi verifica la scheda sulla fonte** (L5a e L5b, poi il coordinatore in
C3), solo dopo aver risolto ogni frase della lista e averne scritto l'esito nella scheda
(`concesion`, `plazo.verificado`/`plazo.fuente`, `compatibilidad`…). Il convertitore (L3) lo
mette e non lo toglie mai.

### 8.0 Da v1 a v1.1

| v1 | v1.1 |
|---|---|
| `esquema` v1 (nome del sito precedente), `version: 1` | `"tamiz-perfil"`, `1.1` |
| `situacion_administrativa.tipo` con il codice tolto in v1.1 | si omette il campo (avviso) |
| `esquema` v1 (nome del sito precedente), `version: 1` | `"tamiz-catalogo"`, `1.1`; si aggiungono `redactado_con_ia: true` e `revision_humana: {completa: false, por: null, el: null}` |
| scheda: `verificado_el` (data scritta da un agente) | `leido_por_agente` = quella data; `verificado_el: null` |
| scheda: `revisar_antes_de` | ricalcolato come in §4.2 da `leido_por_agente` |
| regola con il codice tolto in `valor` | come in §8.3, riga `persona.situacion_administrativa` |

### 8.1 Profilo

| v0 | v1.1 | trasformazione |
|---|---|---|
| (assente) | `esquema` | scrivere `"tamiz-perfil"` |
| `version` | `version` | `1.1` |
| `residencia.pais`, `.region`, `.municipio`, `.empadronado_desde` | stessi | copia |
| (assente) | `residencia.municipio_ine` | se `municipio` è `València` o `Valencia` → `"46250"`; altrimenti si omette |
| `persona.anio_nacimiento` | stesso | copia |
| `persona.nacionalidades` | stesso | copia |
| `persona.situacion_administrativa` | `situacion_administrativa.tipo` | stesso codice; il codice v0 per chi è senza documento in vigore **non esiste in v1.1**: il campo si omette (avviso). Avviso anche se `proteccion_internacional` (in v1.1 vuol dire **concessa**) |
| `persona.residencia_legal_desde` | `situacion_administrativa.residencia_legal_desde` | copia |
| `hogar.miembros`, `.hijos`, `.monoparental` | stessi | copia |
| `vivienda.regimen`, `.alquiler_mensual`, `.contrato_a_su_nombre` | stessi | copia |
| `ingresos.anual_bruto` | `ingresos.individual.importe` | intero arrotondato; più `tramo` corrispondente |
| `ingresos.anual_hogar` | `ingresos.hogar.importe` | idem |
| `ingresos.patrimonio_sin_vivienda` | `ingresos.patrimonio_sin_vivienda.importe` | idem |
| `empleo.situacion` | `empleo.situaciones` | lista di un elemento; `investigador_predoctoral` → `["asalariado"]` e, se manca, `tipo_contrato: "predoctoral"`; `investigador_postdoctoral` → `["asalariado"]` e `tipo_contrato: "postdoctoral"`; gli altri codici uguali |
| `empleo.tipo_contrato` | stesso | `predoctoral_ley_ciencia` → `predoctoral`; `obra_proyecto_investigacion` → `cientifico_tecnico` (avviso); `practicas` → `formativo`; `indefinido`, `temporal`, `ninguno` uguali |
| `empleo.meses_cotizados_6_anios`, `.inscrito_demandante`, `.cobra_prestacion` | stessi | copia |
| `estudios.nivel_max`, `.matriculado_en`, `.titulo_extranjero` | stessi | copia |
| `estudios.homologado` | `estudios.homologacion` | `true` → `"concedida"`; `false` → si omette (avviso: non si sa se è `no_pedida`, `en_tramite` o `denegada`) |
| `salud.discapacidad_pct` | — | **si cancella** (avviso): nella v1.1 non c'è nessun campo di salute |
| `intereses` | stesso | copia, scartando i codici che non sono nell'enum `interes` (avviso) |
| `conduccion.permiso_pais` | `vinculos.permiso_conducir_pais` | copia |

### 8.2 Scheda

| v0 | v1.1 | trasformazione |
|---|---|---|
| `id`, `nombre`, `organismo`, `ambito`, `resumen` | stessi | copia |
| `tipo` | `subtipo` | stesso codice |
| (assente) | `tipo` | da `subtipo`: `prestacion`, `deduccion_fiscal`, `tramite_ventaja`, `servicio_gratuito`, `descuento` → `derecho`; `beca`, `premio`, `empleo`, `formacion_remunerada` → `oportunidad`; `subvencion` → `oportunidad` + `_revisar` «¿concesión reglada o competitiva?» |
| (assente) | `concesion` | `prestacion`, `deduccion_fiscal`, `tramite_ventaja` → `reglada`; `servicio_gratuito`, `empleo` → `no_aplica`; `premio`, `beca`, `formacion_remunerada` → `concurrencia_competitiva`; `subvencion`, `descuento` → `desconocida` |
| `cuantia` (testo) | `cuantia.texto` | copia |
| `condiciones` | `requisitos` | regola per regola, §8.3 |
| `requisitos_no_evaluables` | stesso | copia |
| `plazo.tipo` | `plazo.tipo` | `anual` → `convocatoria_anual`; `abierta` → `abierto_todo_el_ano`; `fechas` → `fechas`; `cerrada` → `cerrado`; `desconocido` → `desconocido` |
| `plazo.inicio`, `plazo.fin` | stessi | copia solo se il nuovo `tipo` li ammette (§4.6) e non sono vuoti (`null`, `""` → si omettono); altrimenti si spostano nella `nota` come «Fechas anteriores: …» |
| `plazo.nota` | stesso | copia |
| (assente) | `plazo.verificado` | sempre `false` (diventa `true` solo con la verifica sul testo ufficiale e `plazo.fuente`, §4.6). Se `tipo` è `fechas`: `_revisar` «verificar fechas en la convocatoria oficial» |
| `incompatible_con`, `compatible_con`, `nota_compatibilidad` | `compatibilidad` | `{"declarada_en_bases": false}`. Se una delle tre non era vuota: `_revisar` «v0 decía: incompatible_con=[…], compatible_con=[…], nota=…; confirmar en las bases» |
| `como_pedirla` | stesso, e `siguiente_paso.texto` | copia in entrambi; `siguiente_paso.url` = `url_oficial`. Se `como_pedirla` manca: `siguiente_paso.texto` = «Consulta la página oficial» + `_revisar` «escribir el siguiente paso» |
| `url_oficial`, `fuente` | stessi | copia |
| `bdns` | stesso | copia se è una stringa di 3-8 cifre; `null` o `""` → si omette |
| `verificado` | `leido_por_agente` | copia (la data v0 è quella in cui un agente ha letto la fonte) |
| (assente) | `verificado_el` | sempre `null`: nessuna persona ha ancora rivisto la scheda |
| (assente) | `revisar_antes_de` | `leido_por_agente` + 90 giorni; oppure `plazo.fin` se viene prima **ed è dopo** `leido_por_agente` (un `fin` già passato non conta) |
| (assente) | `solicita` | `persona`, salvo quando le bases dicono che presenta un altro: `empresa` (es. Doctorados Industriales), `director_tesis` (es. Grisolía, BEFPI), `universidad`, `otro` |
| `confianza` | stesso | copia |
| (assente) | `ayuda_humana` | `[]` + `_revisar` «añadir al menos una ayuda humana gratuita» (finché resta vuota la scheda non è valida) |

### 8.3 Regole

Prima si rinomina il campo, poi si traduce l'operatore.

| regola v0 | regola v1.1 |
|---|---|
| `persona.edad` (qualunque op) | `calc.edad`, stesso op e valor |
| `persona.situacion_administrativa` | `situacion_administrativa.tipo`; nei `valor` si espande: `ciudadano_ue` → `ciudadano_ue`, `ciudadano_ue_permanente`; `familiar_ue` → `familiar_ue`, `familiar_ue_permanente`; `residencia_larga_duracion` → `residencia_larga_duracion`, `residencia_larga_duracion_ue`. Con `==`/`!=` e un valore espanso, l'op diventa `in`/`not_in`. Se c'era `ciudadano_ue`: `_revisar` «¿incluye a ciudadanos UE sin certificado de registro?». Se c'era `proteccion_internacional`: `_revisar` «¿incluye a solicitantes?». **Il codice v0 per chi è senza documento in vigore** non esiste in v1.1: con `!=`/`not_in` («no estar en situación irregular» e simili) la regola diventa `in` con i 14 codici che una regola può usare (§2.4 senza `otro` e `no_lo_se`), meno gli altri codici che la regola v0 escludeva; con `==`/`in` la regola si toglie, il suo `texto` va in `requisitos_no_evaluables` e `_revisar` «requisito sobre situación administrativa: revisar» |
| `persona.residencia_legal_desde`, op `years_since>=`, valor `n` | `calc.anios_residencia_legal`, `>=`, `n` |
| `residencia.empadronado_desde`, op `years_since>=`, valor `n` | `calc.anios_empadronado`, `>=`, `n` |
| `ingresos.anual_bruto` | `calc.ingresos_individuales`, stesso op e valor; `_revisar` «¿las bases miden ingresos brutos? si no, añadir no_concluyente» |
| `ingresos.anual_hogar` | `calc.ingresos_hogar`, idem |
| `ingresos.patrimonio_sin_vivienda` | `calc.patrimonio_sin_vivienda`, idem |
| `hogar.hijos`, op `exists` | `calc.num_hijos`, `>=`, `1`; `_revisar` «comprobar edad y número de hijos (calc.hijos_menores_3/18/25)» |
| `empleo.situacion`, op `==` / `!=` / `in` / `not_in` | `empleo.situaciones`, op `contains` / `not_contains` / `contains_any` / `contains_none`. `investigador_predoctoral` → regola `empleo.tipo_contrato == "predoctoral"` (con `!=`/`not_in`: `_revisar`); `investigador_postdoctoral` → idem con `postdoctoral`; in una lista mista si sostituiscono con `asalariado` + `_revisar` |
| `empleo.tipo_contrato` | stesso campo, codici come in §8.1 |
| `estudios.homologado` `== true` / `== false` | `estudios.homologacion` `==` / `!=` `"concedida"` |
| `salud.*` | la regola si toglie, il suo `texto` va in `requisitos_no_evaluables`; `_revisar` «requisito de salud: decidir si se publica» |
| `conduccion.permiso_pais` | `vinculos.permiso_conducir_pais` |
| `intereses` | la regola si toglie; `_revisar` «los intereses no son requisitos» |
| qualunque campo con op `exists` (salvo `hogar.hijos`) | la regola si toglie; `_revisar` «exists no existe en v1.1: …» |
| qualunque altro campo con op `years_since>=` | la regola si toglie; `_revisar` |
| tutti gli altri campi di §4.3 | stesso campo, op e valor; `valor` booleano o numero invariato |

Ogni regola tradotta conserva il suo `texto`. Dopo la conversione la scheda si valida
contro `#/$defs/ficha`: se fallisce, l'errore indica il campo da sistemare a mano.

---

## 9. Gli esempi

Tutto **inventato**, in `schema/esempi/`, valido contro lo schema (`validar.py` lo controlla).

- **Lucía** (`perfil-lucia.json`): 28 anni (1998, marzo), portoghese, cittadina UE con
  certificado de registro, a València dal 2023, contratto predoctoral in una universidad
  pública valenciana fino al 2027, dottoranda, affitto di 650 €/mese a suo nome, vive sola,
  reddito per tramo (`de_18001_a_21000`, senza importe: mostra le soglie dentro il tramo),
  un'ayuda segnata come `interesa` (`es-vc-bono-alquiler-joven-2026`). Nessun dettaglio della
  persona reale da cui nasce il progetto.
- **Rodrigo** (`perfil-rodrigo.json`): paraguaiano, nato nel 1991 senza mese (età `[34, 35]`
  oggi, `[35, 36]` dopo il 1° gennaio 2027: una soglia a 35 chiede il mese), residencia de
  larga duración concessa a settembre 2026, residenza legale dal 2021-06, empadronado dal
  2019 (solo l'anno). Lasciati vuoti apposta: famiglia (niente `hogar.miembros` né `hijos`),
  affitto mensile, reddito (`tramo: "no_lo_se"`), patrimonio. Con
  `no_lo_se`/`prefiero_no_decirlo`: tipo di contratto, homologación del título, coppia.
  Servono a mostrare «Te falta un dato» con la domanda giusta.
- **Tre schede** (`fichas/`), riscritte a mano in v1.1 dalle voci v0 di
  `docs/ricerca/R3` e `R4` (testi, importi e date da lì, non verificati da una persona:
  `verificado_el: null`): una `derecho` aperta tutto l'anno (paro), una `oportunidad` con
  `fechas` future e `plazo.verificado: true` (FPU 2026), una `cerrado` (Bono Alquiler Joven
  2026). Nella FPU `plazo.verificado: true` e `revisar_antes_de: 2026-11-13` sono **valori
  dimostrativi**, presi dal piano (L5) per avere un esempio di plazo verificato: le date
  vengono da R3, che cita la convocatoria, ma nessuno le ha confrontate col testo ufficiale
  (lo dice anche `plazo.nota`); le conferma L5 sulla scheda vera. I requisiti delle bases che
  una regola non controlla stanno tutti in `requisitos_no_evaluables` (FPU: i 12 mesi di
  contratto predoctoral già goduti; Bono: tutte le voci v0 di R4, con i limiti d'affitto di
  ogni zona dell'anexo I). Servono all'interfaccia finché L3 e L5 non producono `catalogo/fichas/`, e sono gli
  esempi della sezione «Contrato de evaluar()».
- **`ayuda_humana.json`** (tre enti pubblici citati dalle stesse fonti) e **`glosario.json`**
  (tre termini): il minimo perché il catalogo segnaposto sia valido. L'elenco vero lo scrive
  L3 in `catalogo/`.

`python3 scripts/construir.py --ejemplo` costruisce da qui il `web/data/catalogo.json`
segnaposto e copia i due profili in `web/data/ejemplos/`.

---

## 10. Cosa non c'è nella v1.1 (e perché)

- Salute e disabilità: §2.6.
- Enti con nome (una scheda per «i dipendenti dell'ente X»): servirà un catalogo di enti
  con id; nella v1.1 le regole vedono solo tipo e territorio dell'ente.
- Storico degli stati di una `solicitud`: la v1.1 tiene solo lo stato attuale e la sua data.
- Soglie espresse in IPREM: il catalogo scrive l'euro già calcolato e la formula nel
  `texto`; quando l'IPREM cambia, la scheda passa da `revisar_antes_de`.
- Scadenze relative al profilo («entro 15 giorni dalla fine del contratto»): solo in
  `plazo.nota`.
