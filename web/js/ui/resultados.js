// La pagina dei risultati: gruppi, schede, domande che mancano. Solo testo del catalogo e dell'esito.
import { el, fechaLarga, esFinTecnico, sinFinTecnico, sinFinTecnicoEn } from "./dom.js";
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

// Un link per domanda diversa: due campi che portano alla stessa schermata danno un link solo.
function enlacesDomanda(ctx, paths) {
  const campos = [...new Set(paths.map((p) => campoDeDomanda(p, ctx.perfil)))];
  return campos.map((p) => enlaceDomanda(ctx, p));
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
    el("h3", { text: c.nombre }),
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
  return el("article", { class: "ficha", id: `ficha-${f.id}`, "data-id": f.id },
    cabecera,
    el("p", { class: "resumen", text: c.resumen }),
    preguntas,
    el("div", { class: "requisitos-bloque" }, el("p", { class: "etiqueta-bloque", text: "Lo que dices sobre cada requisito:" }), lista),
    evaluables,
    compat,
    solicita,
    siguiente,
    humana,
    pie);
}

function grupo(titulo, id, items, vacio) {
  const seccion = el("section", { class: "grupo-resultados", "aria-labelledby": id },
    el("h2", { id, text: `${titulo} (${items.length})` }));
  if (!items.length) {
    seccion.append(el("p", { class: "vacio", text: vacio }));
  }
  return seccion;
}

// Quante schede mostrare subito per gruppo: al massimo 5 in tutto, ma almeno una per ogni gruppo non vuoto,
// così nessun gruppo appare solo come «Ver las otras…» (il primo gruppo prende le schede rimaste).
const MOSTRAR_SUBITO = 5;
function reparto(listas) {
  const n = listas.map((l) => (l.length ? 1 : 0));
  let libres = Math.max(0, MOSTRAR_SUBITO - n.reduce((a, b) => a + b, 0));
  listas.forEach((l, i) => {
    const extra = Math.min(libres, l.length - n[i]);
    n[i] += extra;
    libres -= extra;
  });
  return n;
}

function textoVerOtras(n) {
  return n === 1 ? "Ver la otra de este grupo" : `Ver las otras ${n} de este grupo`;
}

export function renderResultados(ctx) {
  const { catalogo, perfil, hoy } = ctx;
  const mapa = new Map((catalogo.fichas || []).map((f) => [f.id, f]));
  const ayudaMapa = new Map((catalogo.ayuda_humana || []).map((a) => [a.id, a]));
  const r = ctx.evaluar(catalogo, perfil, hoy);
  registraReglasNoValidas(catalogo, r);
  const derechos = r.fichas.filter((f) => f.apertura !== "cerrada" && f.tipo === "derecho");
  const oportunidades = r.fichas.filter((f) => f.apertura !== "cerrada" && f.tipo === "oportunidad");
  const cerradas = r.fichas.filter((f) => f.apertura === "cerrada");
  // Come ics.py: entra nel calendario solo un plazo verificato con data non ancora passata.
  const hayEventos = (catalogo.fichas || []).some((f) => f.plazo && f.plazo.tipo === "fechas"
    && f.plazo.verificado === true && f.plazo.fin && f.plazo.fin >= hoy);
  const vacioPerfil = Object.keys(perfil).length === 0;
  const grupos = [
    ["Derechos", "g-derechos", derechos, "No hay derechos que mostrar ahora."],
    ["Oportunidades", "g-oportunidades", oportunidades, "No hay oportunidades que mostrar ahora."],
    ["Cerradas ahora", "g-cerradas", cerradas, "Ninguna ayuda cerrada."],
  ];
  const cuantas = reparto(grupos.map(([, , lista]) => lista));
  const pintaGrupo = ([titulo, id, lista, vacio], visibles) => {
    const sec = grupo(titulo, id, lista, vacio);
    const dentro = [];
    const plegadas = [];
    for (const f of lista) {
      const c = mapa.get(f.id);
      if (!c) continue;
      const ayudas = (c.ayuda_humana || []).map((x) => ayudaMapa.get(x)).filter(Boolean);
      const nodo = tarjeta(ctx, f, c, ayudas);
      if (dentro.length < visibles) dentro.push(nodo); else plegadas.push(nodo);
    }
    sec.append(...dentro);
    if (plegadas.length) {
      sec.append(el("details", { class: "mas" },
        el("summary", { text: textoVerOtras(plegadas.length) }), plegadas));
    }
    return sec;
  };

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
  if (hayEventos) {
    bloques.push(el("p", null, el("a", { class: "boton secundario", href: "calendario.ics", download: "calendario.ics",
      text: "Añadir a mi calendario" })));
  }
  if (r.ocultas_por_territorio > 0) {
    bloques.push(el("p", { class: "ocultas", text: `Hay ${r.ocultas_por_territorio} fichas de otros territorios que no se muestran.` }));
  }
  if (!r.fichas.length) {
    bloques.push(el("p", { class: "vacio", text: "No hay ayudas en el catálogo que se puedan mostrar." }));
  }
  grupos.forEach((g, i) => bloques.push(pintaGrupo(g, cuantas[i])));
  return sinFinTecnicoEn(el("div", { class: "resultados" }, bloques));
}
