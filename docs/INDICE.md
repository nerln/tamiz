# Indice automatico delle convocatorie (L22)

Stato: seconda versione (L22-2). Costruito da `scripts/indice.py`, mostrato da `web/indice.html` e
`web/js/indice.js`. Dati: `web/data/indice.json` (rigenerato al build ogni giorno da
`.github/workflows/pages.yml`). Piano: `docs/ONDATA-UNIVERSALE.md` (U3). Lotto L22.

## Che cosa fa

Legge ogni giorno le convocatorie di ayudas, becas e premios per persone fisiche, dello Stato
e della Comunitat Valenciana, e le mostra senza valutarle. Il sito dice sempre, in evidenza:
«Índice automático, sin revisar: no evaluamos si encajan contigo».

Non dice se una convocatoria encaja con qualcuno. Non produce esiti, non usa il profilo, non
legge dati personali. È un elenco per trovare, la decisione resta alla persona che legge le bases.

## Fonti

| Fonte | Che cosa si legge | Come | Attribuzione mostrata |
|---|---|---|---|
| BDNS (infosubvenciones.es) | convocatorie per persone fisiche (`tiposBeneficiario=1`), ultimi 90 giorni | API JSON pubblica, senza chiave: `convocatorias/busqueda` e, per ogni convocatoria, `convocatorias?numConv=` | «Fuente: Base de Datos Nacional de Subvenciones (infosubvenciones.es). Reutilización sujeta al aviso legal del portal.» |
| BOE (canali RSS) | `ayudas`, `becas`, `premios`: solo le voci che parlano di una convocatoria | RSS 2.0, ISO-8859-1 | «Basado en datos de la Agencia Estatal Boletín Oficial del Estado.» |

Ricerche BDNS:
- `regiones=1`: si tiene solo `nivel1 = ESTADO` (ambito «Estado»).
- `regiones=54,55,56,57` (ES52 Comunidad Valenciana e le tre province): si tengono `AUTONOMICA`,
  `LOCAL` e `OTROS` (ambito «Comunitat Valenciana» o «Local»). Il filtro BDNS è largo, quindi il
  livello viene riletto sui dati della convocatoria.

L'attribuzione «Origen de los datos: Intervención General de la Administración del Estado» è stata
tolta: veniva da un riassunto di terzi, non dal testo ufficiale dell'aviso legal (vedi «Dubbi»).

Piano delle fonti non usate: BOE sumario (serve per le norme, non per le convocatorie, vedi
R1), DOGV (nessuna API né RSS trovati, vedi R1), GVA Dades Obertes (solo concessioni già date),
EURAXESS (robots.txt: `Disallow: /jobs/*`, quindi solo link).

## Stato del plazo

Lo stato si calcola dalle date della BDNS, con le stesse regole nel build (`estado_plazo()` in
`scripts/indice.py`) e nella pagina (`calcEstado()` in `web/js/indice.js`, che lo ricalcola con la
data del visitatore). Il flag BDNS «abierto» non conta quando ci sono le date: nella build del
14/10/2026 contraddiceva le date di tutte le convocatorie aperte per data.

| Caso | Stato | Testo sul sito |
|---|---|---|
| `inicio <= oggi <= fin` | `abierta` | «Abierta hasta el …» |
| `fin` passata | `cerrada` | «Cerrada el …» |
| `inicio` futura | `proxima` | «Abre el …» |
| date mancanti o incomplete, flag «abierto» vero | `abierta` (`estado_por: bdns`) | «Abierta según la BDNS (sin fecha de cierre)» |
| date mancanti e flag non vero; BOE | `segun_bases` | «Plazo según las bases»; con la BDNS, il testo del plazo (`textInicio`, `textFin`) se c'è e non è un modello vuoto, altrimenti «Plazo: consulta las bases» |

Il flag falso non diventa mai «Cerrada». Nei 421 dettagli letti il 14/10/2026 il flag era falso in
tutti i 150 casi con entrambe le date, anche quelli con il plazo in corso; senza date era vero in 12
casi su 234, e falso anche dove il plazo scritto a parole è in corso («hasta el 23 de octubre de 2026»).

## Le schede della pagina

«Todas N», «Abiertas ahora N», «Próximamente N»: i conteggi seguono la ricerca e l'ambito scelti.
La predefinita è «Todas». «Abiertas ahora» comprende solo `abierta`; sotto i filtri la pagina dice
quante convocatorie quella vista lascia fuori e perché (senza date, che abren más adelante, cerradas).
«Próximamente» conta le convocatorie `proxima` più le plazas previstas.

## Destinatari

- BDNS, dal dettaglio (`tipoConvocatoria`, `tiposBeneficiarios`):
  - fuori `Concesión directa - instrumental`: concessione diretta a un beneficiario già deciso, senza
    convocatoria a cui presentarsi (nei dati del 14/10/2026: 41, fra cui convenios, subvenciones
    nominativas a entidades, becas già assegnate);
  - fuori le convocatorie i cui beneficiari dichiarati sono solo enti o imprese (persone giuridiche,
    PYME e autonomi, grandi imprese) senza «personas físicas que no desarrollan actividad económica»;
  - «Destinatarios: personas físicas según la BDNS» solo quando il dettaglio ha solo quel tipo
    (`personas_fisicas`); se il dettaglio elenca persone fisiche e altri beneficiari (`personas_y_entidades`):
    «Destinatarios: personas físicas y entidades según la BDNS». Senza dettaglio, o con un elenco che non
    lo conferma, «Destinatarios sin verificar: mira las bases».
  - Restano le `Concesión directa - canónica`: hanno una convocatoria aperta a chi rispetta i requisiti
    (material escolar, emergencia social, bono consumo, familias monoparentales).
- Titoli, per BDNS e BOE: fuori le concessioni a un ente nominato (`subvención directa a`,
  `nominativa`, `concede`) e i titoli il cui destinatario è un ente: `a/para/destinadas a` seguito da
  ayuntamientos, entidades, empresas, asociaciones, fundaciones, centros, corporaciones locales,
  universidades, clubes, cooperativas…; e `entidades de formación`, `entidades locales`,
  `plataformas tecnológicas`, `proyectos de generación de conocimiento`, `doctorados industriales`,
  `Torres Quevedo`, `contratación de personas jóvenes`, `negociación colectiva`, `gastos de funcionamiento`.
- BOE: nel canale `ayudas` restano solo i titoli che parlano di persone (becas, premios, contratos
  predoctorales, Ramón y Cajal, Juan de la Cierva, personal técnico, estudiantes, jóvenes, mujeres,
  deportistas…); nei canali `becas` e `premios` restano tutti quelli non esclusi sopra. Si scartano
  anche modifiche, ampliamenti di credito e correzioni. I destinatari BOE restano «sin verificar»:
  un titolo come «Premios a Proyectos de Educación Inclusiva» (per scuole) può passare.

## Piano delle plazas previste

`catalogo/previstas.json`, curato a mano, con fonte e data di verifica per ogni voce. Contiene
solo Ofertas de Empleo Público **approvate** e con il testo ufficiale letto (o la nota ufficiale
dichiarata come tale). Non dice quali convocatorie sono già pubblicate: la pagina lo segnala
(«Algunas convocatorias ya están publicadas»).

Oggi:
- Estado: Real Decreto 387/2026 (BOE 07/05/2026), 27.232 plazas (cifra della nota del Gobierno).
- Generalitat: Decreto 16/2026 (DOGV 09/02/2026), 2.671 plazas. Due tagli dello stesso totale,
  ciascuno che somma 2.671: per tasa (571 + 2.100) e per turno (1.603 + 1.068). Non si sommano fra loro.
- Ajuntament de València: 376 plazas (nota del 12/06/2026). La nota dice 256 per turno libre e «el
  resto, principalmente por promoción interna»; cita 100 plazas di Policía Local e 30 di Bomberos
  senza dire in quale turno. Nessun desglose completo: il 120 di promozione interna è un calcolo nostro
  e non compare.

Non inclusi: il decreto della Conselleria de Educación per il personale docente (citato da una
fonte secondaria con 2.067 plazas, non letto nel DOGV). Va aggiunto solo dopo lettura.

## Regole del build

- Solo libreria standard di Python, una richiesta alla volta, con 1 secondo di pausa. Il limite
  BDNS (10 richieste al secondo, nessuna concorrente) è rispettato con largo margine.
- Timeout 20 secondi per richiesta.
- Ogni dettaglio BDNS è una chiamata. Al massimo 600 dettagli per build. Le convocatorie oltre il
  limite restano nell'indice senza dettaglio (destinatari «sin verificar») e il numero è in «fuentes».
- Nessuna richiesta contiene dati personali: solo la data di inizio della finestra e i filtri
  di regione.
- Massimo 500 convocatorie. Se sono di più, il taglio toglie prima le chiuse più vecchie, ed è
  dichiarato sul sito («El índice guarda … de …»).
- Concessioni (dati di chi ha già ricevuto una somma): non si scaricano.

## Se una fonte fallisce

Il file non viene svuotato. Le fonti sono divise in cinque sezioni (`bdns_estado`, `bdns_valencia`,
`boe_ayudas`, `boe_becas`, `boe_premios`), e ognuna decide da sé se usare la lettura di oggi o le voci
della build precedente (entro 90 giorni), che restano con il loro stato ricalcolato:

- ricerca BDNS fallita a qualunque pagina (errore HTTP, timeout, risposta senza `content`): la lettura
  a metà non si usa, si conservano le voci precedenti della sezione;
- risposta vuota, o con meno della metà dei risultati della lettura precedente (si confrontano i
  risultati grezzi, `candidatas`, salvati in `fuentes`): lettura sospetta, si conservano le precedenti;
- più della metà dei dettagli BDNS senza risposta: lettura interrotta, si conservano le precedenti;
- un dettaglio nullo, vuoto, non JSON o non oggetto: la convocatoria riprende la voce precedente se
  c'è; altrimenti resta con i dati della ricerca, `segun_bases` e destinatari «sin verificar»;
- canale BOE non letto o non RSS: si conservano le voci precedenti di quel canale;
- nessuna sezione letta oggi e file precedente presente: il file non viene toccato, exit 0;
- qualunque eccezione non prevista: il file non viene toccato, exit 0. Exit 1 solo se non si
  riesce a scrivere il file.

In `fuentes` ogni fonte ha `estado` (`ok`, `parcial`, `error`), `secciones` (stato `ok`, `anterior`
o `error`, numero di voci, data della lettura) e `motivo`, che dice cosa manca: per esempio
«BOE, canal de becas: no se pudo leer la fuente hoy; se mantienen 1 convocatoria de la lectura del
12/10/2026» o «3 convocatorias sin detalle». Il motivo tecnico (HTTPError, letture interrotte) sta
nel campo `detalle_tecnico`, solo nel JSON. La pagina mostra «lectura parcial», «Aviso: …» e
l'elenco delle sezioni.

In ogni caso il passo del workflow è `continue-on-error`: un errore non blocca la pubblicazione.
Il file `web/data/indice.json` non viene committato dal workflow: se il build non riesce per giorni,
il sito mostra la data dell'ultimo file del commit e, dopo 3 giorni, un avviso.

## Numeri

Sul sito i numeri hanno sempre il punto delle migliaia (`numero()` in `web/js/indice.js`, `miles()`
nello script): «2.671 plazas» come nei testi. `toLocaleString("es-ES")` non va bene: sotto 10.000
scrive «2671».

## Prove

- `python3 tests/test_indice.py`: lo script contro un server BDNS e BOE finto (dati sintetici, mai
  dati veri di nessuno). Stato dalle date (5 casi), destinatari BDNS (nominativa, solo imprese, solo
  persone giuridiche, senza elenco, titolo per asociaciones, concesión directa canónica che resta),
  filtro BOE (ayuntamientos, entidades, generación de conocimiento, centros fuori; becas, premios,
  predoctorales dentro), ricerca che fallisce alla seconda pagina, ricerca vuota, canale BOE in
  errore, dettaglio `null`, tutto giù con file intatto, motivo della lettura parziale. Con
  `TAMIZ_INDICE_SCRIPT=<altro indice.py>` prova un'altra versione (sul commit 897b0b3: 8 rosse su 9).
- La pagina si prova con un browser senza testa (fuori dal repository): scheda predefinita «Todas»,
  conteggi delle schede, nota su cosa lascia fuori «Abiertas ahora», plazas previste dalla vista
  «Todas» con il link alla sezione, «lectura parcial» con «Aviso», etichette dei destinatari, plazo
  modello vuoto sostituito, nessuna richiesta fuori origine, niente scroll orizzontale a 375 px.

## Limiti

- BDNS dice che esiste una convocatoria, non quali requisiti ha: stanno nelle bases (PDF).
  Per questo nell'indice non c'è nessun esito.
- Per le convocatorie BOE il canale non dà la data di chiusura, né i destinatari.
- Lo stato dipende dalle date della BDNS. Se la BDNS è sbagliata sulle date, lo è anche il sito.
  Più della metà delle convocatorie BDNS non ha date (plazo a parole, «20 días hábiles desde…»):
  sono «Plazo según las bases» e stanno solo in «Todas».
- La ricerca BDNS usa già `tiposBeneficiario=1`, quindi quasi tutti i dettagli hanno il tipo persona
  fisica; il filtro sul dettaglio pesa soprattutto con `tipoConvocatoria` e con i titoli.
- L'indice non sostituisce le schede verificate di `catalogo/fichas/`. Le schede di ricerca
  restano curate a mano.

## Termini d'uso (lettura del 14/10/2026)

- BDNS: il sito ufficiale rimanda all'aviso legal, che è una pagina in JavaScript. Non è stato
  possibile leggerne il testo integrale con gli strumenti a disposizione. Sono state lette:
  - la guida ufficiale «Buenas prácticas API SNPSAP» (versione 23/03/2026, PDF): dice che la
    riutilizzazione è libera ma «no tiene carácter normativo»; rimanda all'aviso legal e alla
    Ley 37/2007; mette in guardia contro un uso abusivo che può portare al blocco dell'accesso;
  - la risposta dell'API, che in ogni chiamata ricorda le condizioni di riutilizzo («advertencia»).
  - Un riassunto di terzi (fonte non ufficiale) del testo dell'aviso riporta: uso commerciale e
    non commerciale permesso, attribuzione obbligatoria, nessuna suggestione di patrocinio, tenere
    le date di aggiornamento. Non è stato verificato sul testo ufficiale. Vedi «Dubbi» sotto.
- BOE: aviso legal letto (R1, 14/10/2026): uso permesso, attribuzione obbligatoria
  («Basado en datos de la Agencia Estatal Boletín Oficial del Estado» per opere derivate),
  non alterare il senso, indicare la data di aggiornamento.

## Dubbi aperti

- Il testo esatto dell'aviso legal BDNS non è stato letto (pagina JavaScript). L'attribuzione
  con l'origine IGAE è stata tolta per questo. Il testo «Reutilización sujeta al aviso legal del
  portal» viene dalla risposta dell'API. Va confermato l'aviso prima della pubblicazione.
- Il formato del link alla scheda BDNS (`/GE/es/convocatoria/<codigo>`) non è stato provato
  contro il sito (è una SPA).
- I valori `nivel1` del filtro sono quelli letti nelle risposte, non documentati.
- `web/indice.html` non è collegata da nessuna altra pagina di `web/` e non usa il sistema di
  design (`estilo.css`, logo, footer «Hecho por nerln»): va agganciata da L23, che possiede `index.html`
  ed `estilo.css`.
- Il link «Hecho por nerln» (U6) non è stato messo: l'indirizzo del portfolio è da confermare.
- Concessioni dirette: il piano chiedeva di escluderle; si escludono quelle `instrumental` e quelle a un
  ente nominato. Le `Concesión directa - canónica` restano perché sono convocatorie aperte a persone
  (material escolar, emergencia social). Se si vogliono fuori anche queste, basta `"directa" in tipo`
  in `es_concesion_nominativa()`.
