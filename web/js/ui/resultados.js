// La pagina dei risultati: esiti per area, filtri per area, schede, domande che mancano.
// Solo testo del catalogo e dell'esito.
import { el, fechaLarga, esFinTecnico, sinFinTecnico, sinFinTecnicoEn, AREAS, SIN_AREA, areaValida, nombreArea, ordenArea } from "./dom.js";
import { pantallaPara, campoDeDomanda } from "../preguntas.js";

const ETIQUETA_ESTADO = { encaja: "Parece que encajas", falta_dato: "Te falta un dato", no_encaja: "No encaja" };
const CLASE_ESTADO = { encaja: "estado-encaja", falta_dato: "estado-falta", no_encaja: "estado-no" };
const SOLICITA = { empresa: "la empresa", universidad: "la universidad", director_tesis: "tu director o directora de tesis",
  otro: "otra entidad" };

// Un link che riporta alla domanda: la pantalla viene messa in cima alla pila nel contesto.
// Il campo passa da campoDeDomanda, così il link non punta a una pantalla che non si mostra.
function enlaceDomanda(ctx, path) {
  const pantalla = pantallaPara(campoDeDomanda(path, ctx.perfil));
  if (!pantalla) return el("span", { text: "Responde a la pregunta correspondiente" });
  return el("button", { type: "button", class: "enlace", text: pantalla.titulo, onclick: () => ctx.irPregunta(pantalla.id) });
}

// Un link per domanda diversa: due campi che portano alla stessa schermata danno un link solo
// (la chiave è la schermata, non il campo: due campi della stessa schermata sono la stessa domanda).
function enlacesDomanda(ctx, paths) {
  const vistas = new Set();
  const enlaces = [];
  for (const path of paths) {
    const campo = campoDeDomanda(path, ctx.perfil);
    const pantalla = pantallaPara(campo);
    const clave = pantalla ? `pantalla:${pantalla.id}` : "sin-pantalla";
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    enlaces.push(enlaceDomanda(ctx, path));
  }
  return enlaces;
}

// Il motore non scrive in console: lo fa l'interfaccia. Una volta per regola e per caricamento del catalogo,
// anche per le schede che poi non si disegnano (per esempio «No encaja» con solo alcune regole mostrate).
const registrate = new WeakMap();
function registraReglasNoValidas(catalogo, r) {
  if (!registrate.has(catalogo)) registrate.set(catalogo, new Set());
  const vistas = registrate.get(catalogo);
  for (const f of r.fichas) {
    for (const q of f.requisitos || []) {
      if (q.motivo !== "regla_no_valida") continue;
      const clave = `${f.id}|${q.texto}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      console.error("Regla no valida", f.id, q.texto);
    }
  }
}

function filaRequisito(ctx, q) {
  const li = el("li", { class: "requisito" });
  li.append(el("span", { class: "requisito-texto", text: q.texto }));
  let etiqueta;
  if (q.resultado === "cumple") {
    etiqueta = el("span", { class: "resultado resultado-si", text: "Sí, según lo que has dicho" });
  } else if (q.resultado === "no_cumple") {
    etiqueta = el("span", { class: "resultado resultado-no", text: "No, según lo que has dicho" });
  } else if (q.motivo === "regla_no_valida") {
    // Regola rotta nel catalogo: il testo ufficiale, senza il prefisso «Falta un dato».
    etiqueta = el("span", { class: "resultado resultado-falta",
      text: q.aclaracion || "No hemos podido comprobar este requisito: léelo en la fuente." });
  } else {
    // Ogni pezzo compare una sola volta: le domande, poi l'aclaración (solo per no_concluyente).
    const preguntas = enlacesDomanda(ctx, q.faltan || []);
    const partes = [];
    if (preguntas.length) partes.push(...preguntas);
    if (q.motivo === "no_concluyente" && q.aclaracion) partes.push(preguntas.length ? " " : "", q.aclaracion);
    if (!partes.length) partes.push(q.aclaracion || "mira la fuente de la ficha.");
    etiqueta = el("span", { class: "resultado resultado-falta" }, "Falta un dato: ", partes);
  }
  li.append(etiqueta);
  return li;
}

// Un tetto tecnico (fine dal 2099) non è una scadenza: «Se abre el…» senza fine, «Abierta» senza data.
function textoPlazo(f, c) {
  const p = c.plazo || {};
  if (p.tipo === "abierto_todo_el_ano") return "Abierta todo el año";
  if (f.apertura === "cerrada") return "Convocatoria cerrada ahora";
  if (f.apertura === "por_abrir") return `Se abre el ${fechaLarga(p.inicio)}${p.fin && !esFinTecnico(p.fin) ? `, plazo hasta el ${fechaLarga(p.fin)}` : ""}`;
  if (f.apertura === "abierta") return f.proximo_plazo && !esFinTecnico(f.proximo_plazo) ? `Abierta hasta el ${fechaLarga(f.proximo_plazo)}` : "Abierta";
  if (p.tipo === "convocatoria_anual") return "Una convocatoria al año: el plazo lo fija cada convocatoria";
  return "Plazo por confirmar";
}

function tarjeta(ctx, f, c, ayudas) {
  const estado = f.estado;
  const cabecera = el("header", { class: "ficha-cabecera" },
    el("h4", { class: "ficha-titulo", text: c.nombre }),
    el("div", { class: "etiquetas" },
      el("span", { class: "etiqueta-tipo", text: f.tipo === "derecho" ? "Derecho" : "Oportunidad" }),
      // Una convocatoria chiusa non «encaja» più con il suo plazo: si dice solo che è chiusa.
      f.apertura === "cerrada"
        ? el("span", { class: "etiqueta-cerrada", text: "Convocatoria cerrada" })
        : el("span", { class: `etiqueta-estado ${CLASE_ESTADO[estado]}`, text: ETIQUETA_ESTADO[estado] }),
      f.por_revisar ? el("span", { class: "etiqueta-revisar", text: "Por revisar" }) : null));
  const requisitosMostrati = estado === "no_encaja" ? f.requisitos.filter((q) => q.resultado === "no_cumple") : f.requisitos;
  const lista = el("ul", { class: "requisitos" }, requisitosMostrati.map((q) => filaRequisito(ctx, q)));
  const preguntas = estado === "falta_dato" && f.faltan.length
    ? el("div", { class: "faltan" }, el("p", { class: "etiqueta-bloque", text: "Responde a esto para saberlo:" }),
      el("ul", { class: "lista-enlaces" }, enlacesDomanda(ctx, f.faltan).map((a) => el("li", null, a))))
    : null;
  // Come da docs/ESQUEMA.md §6.2: il blocco «Además, compruébalo tú» solo con «Parece que encajas».
  const evaluables = estado === "encaja" && (c.requisitos_no_evaluables || []).length
    ? el("div", { class: "comprueba" }, el("p", { class: "etiqueta-bloque", text: "Además, compruébalo tú en las bases:" }),
      el("ul", null, c.requisitos_no_evaluables.map((t) => el("li", { text: t }))))
    : null;
  // Con «No encaja» restano il perché (i requisiti non soddisfatti) e la fonte: niente invito a chiedere ciò che non va.
  const sinAccion = estado === "no_encaja";
  const compat = sinAccion ? null : c.compatibilidad && c.compatibilidad.declarada_en_bases
    ? el("p", { class: "compat" }, "Compatibilidad: " + (c.compatibilidad.texto || ""), " ",
      el("a", { href: c.fuente, rel: "noopener", text: "Ver en la fuente" }))
    : el("p", { class: "compat", text: "Compatibilidad no verificada." });
  const solicita = c.solicita && c.solicita !== "persona"
    ? el("p", { class: "solicita", text: `La presenta ${SOLICITA[c.solicita] || "otra entidad"}.` }) : null;
  const siguiente = !sinAccion && c.siguiente_paso ? el("p", { class: "siguiente" },
    el("strong", { text: "Siguiente paso: " }), c.siguiente_paso.texto, " ",
    c.siguiente_paso.url ? el("a", { href: c.siguiente_paso.url, rel: "noopener", text: "Abrir la página" }) : null) : null;
  const humana = !sinAccion && ayudas.length ? el("p", { class: "ayuda-humana" },
    el("strong", { text: "Ayuda humana gratuita: " }), ayudas.map((a) => a.nombre).join("; "), ". ",
    el("a", { href: "#ayuda", text: "Ver la ayuda humana" })) : null;
  const revision = c.verificado_el
    ? `Revisado por una persona el ${fechaLarga(c.verificado_el)}.`
    : "Revisado por una persona: todavía no.";
  // La nota del plazo (per esempio «la Ley entra en vigor el…», «hasta entonces rige la anterior») va sempre mostrata.
  const notaPlazo = typeof c.plazo?.nota === "string" && c.plazo.nota
    ? el("p", { class: "nota-plazo" }, el("strong", { text: "Nota sobre el plazo: " }), sinFinTecnico(c.plazo.nota))
    : null;
  const pie = el("footer", { class: `ficha-pie${f.por_revisar ? " por-revisar" : ""}` },
    el("p", { text: textoPlazo(f, c) }),
    notaPlazo,
    el("p", { text: `Cuantía: ${c.cuantia?.texto || "ver la fuente"}` }),
    el("p", null, "Fuente: ", el("a", { href: c.fuente, rel: "noopener", text: "Página oficial" })),
    el("p", { class: "fecha-lectura", text: `Leído por IA el ${fechaLarga(c.leido_por_agente)}.` }),
    el("p", { class: "fecha-revision", text: revision }),
    f.por_revisar ? el("p", { class: "aviso-revisar", text: `Esta ficha debe revisarse: pasó la fecha prevista (${fechaLarga(c.revisar_antes_de)}).` }) : null);
  const claseEstado = f.apertura === "cerrada" ? "ficha-cerrada" : `ficha-${CLASE_ESTADO[estado] || "estado-falta"}`;
  return el("article", { class: `ficha ${claseEstado}`, id: `ficha-${f.id}`, "data-id": f.id },
    cabecera,
    el("p", { class: "resumen", text: c.resumen }),
    preguntas,
    // Con «No encaja» il requisito che non va resta in vista; negli altri esiti l'elenco si apre a richiesta.
    estado === "no_encaja"
      ? el("div", { class: "requisitos-bloque" }, el("p", { class: "etiqueta-bloque", text: "Lo que dices sobre cada requisito:" }), lista)
      : el("details", { class: "requisitos-bloque mas" },
        el("summary", { text: `Lo que dices sobre cada requisito (${requisitosMostrati.length})` }), lista),
    evaluables,
    compat,
    solicita,
    siguiente,
    humana,
    pie);
}


// Le schede «informativa» non ricevono un esito: vanno in «Otras ayudas que conviene conocer».
// Il motore può darle in due forme. Nuova: evaluar(...).informativas = [{ id, area }], fuori da r.fichas.
// Vecchia (motore che non conosce il campo): stanno in r.fichas con un esito, e la scheda del catalogo
// ha `informativa: true`; qui si tolgono dagli esiti. In entrambe le forme passano solo le schede che il
// motore ha lasciato passare per territorio.
function separaInformativas(r, mapa) {
  if (Array.isArray(r.informativas)) {
    const ids = new Set(r.informativas.map((x) => x && x.id));
    return {
      evaluadas: r.fichas.filter((f) => !ids.has(f.id)),
      informativas: r.informativas.filter((x) => x && mapa.has(x.id))
        .map((x) => ({ id: x.id, area: areaValida(x.area ?? mapa.get(x.id).area) })),
    };
  }
  const esInf = (f) => mapa.get(f.id)?.informativa === true;
  return {
    evaluadas: r.fichas.filter((f) => !esInf(f)),
    informativas: r.fichas.filter(esInf).map((f) => ({ id: f.id, area: areaValida(f.area ?? mapa.get(f.id).area) })),
  };
}

// Raggruppa per area nell'ordine di AREAS, «Otras» in fondo; dentro l'area resta l'ordine del motore.
function porArea(items) {
  const m = new Map();
  for (const it of items) {
    if (!m.has(it.area)) m.set(it.area, []);
    m.get(it.area).push(it);
  }
  return [...m.entries()].sort((a, b) => ordenArea(a[0]) - ordenArea(b[0]));
}

// Quante schede si vedono subito per area dentro un esito aperto; le altre in «Ver las otras…».
const VISIBLES_POR_AREA = 3;

function textoVerOtras(n, area) {
  return n === 1 ? `Ver la otra de ${nombreArea(area)}` : `Ver las otras ${n} de ${nombreArea(area)}`;
}

const ICONO = { encaja: "✓", falta_dato: "?", no_encaja: "✕", cerrada: "–", info: "i" };

export function renderResultados(ctx) {
  const { catalogo, perfil, hoy } = ctx;
  const mapa = new Map((catalogo.fichas || []).map((f) => [f.id, f]));
  const ayudaMapa = new Map((catalogo.ayuda_humana || []).map((a) => [a.id, a]));
  const r = ctx.evaluar(catalogo, perfil, hoy);
  registraReglasNoValidas(catalogo, r);
  const { evaluadas, informativas } = separaInformativas(r, mapa);
  const conArea = (f) => ({ f, area: areaValida(f.area ?? mapa.get(f.id)?.area) });
  const abiertas = evaluadas.filter((f) => f.apertura !== "cerrada" && mapa.has(f.id)).map(conArea);
  const listas = {
    encaja: abiertas.filter((x) => x.f.estado === "encaja"),
    falta_dato: abiertas.filter((x) => x.f.estado === "falta_dato"),
    no_encaja: abiertas.filter((x) => x.f.estado === "no_encaja"),
    cerrada: evaluadas.filter((f) => f.apertura === "cerrada" && mapa.has(f.id)).map(conArea),
    info: informativas,
  };
  // Come ics.py: entra nel calendario solo un plazo verificato con data non ancora passata.
  const hayEventos = (catalogo.fichas || []).some((f) => f.plazo && f.plazo.tipo === "fechas"
    && f.plazo.verificado === true && f.plazo.fin && f.plazo.fin >= hoy);
  const vacioPerfil = Object.keys(perfil).length === 0;

  // Conteggi per area su tutto quello che la pagina mostra (esiti, cerradas e informative).
  const todas = [...listas.encaja, ...listas.falta_dato, ...listas.no_encaja, ...listas.cerrada, ...listas.info];
  const cuentaArea = new Map();
  for (const x of todas) cuentaArea.set(x.area, (cuentaArea.get(x.area) || 0) + 1);
  const areasPresentes = [...AREAS.map(([k]) => k), SIN_AREA].filter((k) => cuentaArea.has(k));

  const pintaFicha = ({ f }) => {
    const c = mapa.get(f.id);
    const ayudas = (c.ayuda_humana || []).map((x) => ayudaMapa.get(x)).filter(Boolean);
    return tarjeta(ctx, f, c, ayudas);
  };
  const pintaInfo = ({ id }) => {
    const c = mapa.get(id);
    return el("article", { class: "ficha ficha-info", id: `ficha-${id}`, "data-id": id },
      el("h4", { class: "ficha-titulo", text: c.nombre }),
      c.resumen ? el("p", { class: "resumen", text: c.resumen }) : null,
      el("p", { class: "pequeno", text: "No la evaluamos: depende de situaciones que aquí no se preguntan. Lee los requisitos en la fuente." }),
      el("p", null, "Fuente: ", el("a", { href: c.fuente, rel: "noopener", text: "Página oficial" })));
  };

  // Un esito con le sue aree. `plegar` piega le schede oltre VISIBLES_POR_AREA in un «Ver las otras…».
  const bloqueAreas = (items, pinta, { plegar, conTitulos }) => porArea(items).map(([area, lista]) => {
    const nodos = lista.map(pinta);
    const visibles = plegar ? nodos.slice(0, VISIBLES_POR_AREA) : nodos;
    const resto = plegar ? nodos.slice(VISIBLES_POR_AREA) : [];
    return el("div", { class: "grupo-area", "data-area": area },
      conTitulos ? el("h3", { class: "titulo-area" }, nombreArea(area), " ",
        el("span", { class: "cuenta", text: `(${lista.length})` })) : null,
      visibles,
      resto.length ? el("details", { class: "mas" }, el("summary", { text: textoVerOtras(resto.length, area) }), resto) : null);
  });

  const titulo = (clave, id, texto, n) => el("h2", { id, class: `titulo-estado titulo-${clave}` },
    el("span", { class: `icono-estado icono-${clave}`, "aria-hidden": "true", text: ICONO[clave] }),
    el("span", { text: texto }), " ", el("span", { class: "cuenta", text: `(${n})` }));

  const cuerpo = el("div", { class: "cuerpo-resultados" });
  const anuncio = el("p", { class: "sr-only", role: "status" });
  let filtro = "todas";

  function pintaCuerpo() {
    const f = (lista) => (filtro === "todas" ? lista : lista.filter((x) => x.area === filtro));
    const L = Object.fromEntries(Object.entries(listas).map(([k, v]) => [k, f(v)]));
    const conTitulos = filtro === "todas" && areasPresentes.length > 1;
    const resumen = el("ul", { class: "resumen-estados", "aria-label": "Resumen" },
      [["encaja", "Parece que encajas", "g-encaja"], ["falta_dato", "Te falta un dato", "g-falta"], ["no_encaja", "No encaja", "g-no"]]
        .map(([k, t, id]) => {
          const partes = [el("span", { class: `icono-estado icono-${k}`, "aria-hidden": "true", text: ICONO[k] }),
            el("span", { class: "resumen-n", text: String(L[k].length) }),
            el("span", { class: "resumen-t", text: t })];
          // Con zero schede la sezione non c'è: il riquadro resta, ma non è un link.
          const caja = L[k].length
            ? el("a", { href: `#${id}`, onclick: (ev) => { ev.preventDefault(); const d = document.getElementById(id);
              if (d && d.tagName === "DETAILS") d.open = true; (d || cuerpo).scrollIntoView({ block: "start" }); } }, partes)
            : el("span", { class: "resumen-caja" }, partes);
          return el("li", { class: `resumen-estado resumen-${k}` }, caja);
        }));

    // Una sezione senza schede non si mostra: niente titoli con «(0)» e «Ninguna».
    const secEncaja = L.encaja.length
      ? el("section", { class: "estado-seccion seccion-encaja", id: "g-encaja", "aria-labelledby": "t-encaja" },
        titulo("encaja", "t-encaja", "Parece que encajas", L.encaja.length),
        bloqueAreas(L.encaja, pintaFicha, { plegar: true, conTitulos }))
      : null;
    const secFalta = L.falta_dato.length
      ? el("section", { class: "estado-seccion seccion-falta", id: "g-falta", "aria-labelledby": "t-falta" },
        titulo("falta_dato", "t-falta", "Te falta un dato", L.falta_dato.length),
        el("p", { class: "pequeno", text: "Con estas no podemos decir nada hasta que respondas a la pregunta que se indica en cada una." }),
        bloqueAreas(L.falta_dato, pintaFicha, { plegar: true, conTitulos }))
      : null;
    // «No encaja» e «cerradas» stanno chiuse: si aprono a mano.
    const plegable = (clave, id, texto, lista, nota) => (lista.length
      ? el("details", { class: `estado-seccion plegable seccion-${clave}`, id },
        el("summary", null, titulo(clave, `t-${id}`, texto, lista.length)),
        nota ? el("p", { class: "pequeno", text: nota }) : null,
        bloqueAreas(lista, pintaFicha, { plegar: false, conTitulos }))
      : null);
    const secNo = plegable("no_encaja", "g-no", "No encaja", L.no_encaja,
      "Según lo que has dicho, no se cumple al menos un requisito. Se indica cuál.");
    const secCerradas = plegable("cerrada", "g-cerradas", "Convocatorias cerradas ahora", L.cerrada, null);
    const secInfo = L.info.length
      ? el("section", { class: "estado-seccion seccion-info", id: "g-info", "aria-labelledby": "t-info" },
        titulo("info", "t-info", "Otras ayudas que conviene conocer", L.info.length),
        el("p", { class: "pequeno", text: "Dependen de situaciones que aquí no preguntamos, por ejemplo de salud o de cuidados. No las evaluamos: las mostramos por si te sirven." }),
        bloqueAreas(L.info, pintaInfo, { plegar: false, conTitulos }))
      : null;
    // Il riepilogo dei tre esiti solo se almeno uno ha schede (un filtro con sole informative non lo mostra).
    const hayEvaluadas = L.encaja.length + L.falta_dato.length + L.no_encaja.length > 0;
    cuerpo.replaceChildren(...[hayEvaluadas ? resumen : null, secEncaja, secFalta, secNo, secCerradas, secInfo].filter(Boolean));
    sinFinTecnicoEn(cuerpo);
  }

  const chips = [];
  const elegir = (area) => {
    filtro = area;
    for (const b of chips) b.setAttribute("aria-pressed", String(b.dataset.area === area));
    pintaCuerpo();
    const n = area === "todas" ? todas.length : cuentaArea.get(area) || 0;
    anuncio.textContent = area === "todas" ? `Se muestran todas las áreas: ${n} ayudas.` : `Se muestra ${nombreArea(area)}: ${n} ayudas.`;
  };
  const chip = (area, texto, n) => {
    const b = el("button", { type: "button", class: "filtro", "data-area": area, "aria-pressed": String(area === filtro),
      onclick: () => elegir(area) },
    el("span", { text: texto }), " ", el("span", { class: "filtro-n", text: String(n) }));
    chips.push(b);
    return b;
  };
  const filtros = areasPresentes.length > 1
    ? el("div", { class: "filtros", role: "group", "aria-labelledby": "filtros-titulo" },
      el("p", { class: "filtros-titulo", id: "filtros-titulo", text: "Filtrar por área" }),
      el("div", { class: "filtros-lista" },
        chip("todas", "Todas", todas.length),
        areasPresentes.map((a) => chip(a, nombreArea(a), cuentaArea.get(a)))))
    : null;

  const cabecera = el("header", { class: "cabecera-seccion" },
    el("h1", { tabindex: -1, id: "titulo-resultados", text: "Lo que parece encajar contigo" }),
    el("p", { text: "Esto es según lo que nos has dicho. No es una decisión ni una garantía: cada ayuda tiene sus bases, y la última palabra la tiene la convocatoria oficial." }));
  const bloques = [cabecera];
  if (perfil.ejemplo) {
    bloques.push(el("p", { class: "aviso-ejemplo", role: "status" },
      `Estás viendo el perfil de ejemplo de ${perfil.ejemplo.nombre_ficticio || "una persona"}. Son datos inventados.`));
  }
  if (vacioPerfil) {
    bloques.push(el("p", { class: "aviso-vacio" }, "Todavía no has contestado nada. ", el("a", { href: "#preguntas", text: "Empezar las preguntas" })));
  }
  const utiles = [];
  if (hayEventos) {
    utiles.push(el("a", { class: "boton secundario", href: "calendario.ics", download: "calendario.ics", text: "Añadir a mi calendario" }));
  }
  if (r.ocultas_por_territorio > 0) {
    utiles.push(el("p", { class: "ocultas", text: `Hay ${r.ocultas_por_territorio} fichas de otros territorios que no se muestran.` }));
  }
  if (utiles.length) bloques.push(el("div", { class: "utiles" }, utiles));
  if (!r.fichas.length && !informativas.length) {
    bloques.push(el("p", { class: "vacio", text: "No hay ayudas en el catálogo que se puedan mostrar." }));
  }
  pintaCuerpo();
  bloques.push(el("div", { class: `disposicion-resultados${filtros ? " con-filtros" : ""}` },
    filtros ? el("aside", { class: "columna-filtros" }, filtros) : null, anuncio, cuerpo));
  return sinFinTecnicoEn(el("div", { class: "resultados" }, bloques));
}
