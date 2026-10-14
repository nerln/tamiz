import { iniciarIdioma, RAIZ } from "./i18n.js";
// Ofertas de empleo: legge data/empleo.json (generato al build) e le mostra per categoria, con filtri.
// Nessuna richiesta a terzi, nessuno storage del browser, nessun innerHTML: il testo va in textContent.
(() => {
  iniciarIdioma();
  "use strict";

  const DIAS_LIMITE_VIEJO = 3;
  const MS_DIA = 86400000;
  // Al massimo queste offerte per sezione; «Ver más» ne aggiunge altre (le modifiche ai filtri
  // riportano ogni sezione a questo limite).
  const LIMITE_POR_SECCION = 10;
  // Ordine delle sezioni nella lista (stesso ordine delle opzioni del filtro, senza «Todas»).
  const CATEGORIAS = {
    investigacion_universidad: "Investigación y universidad",
    comunitat_valenciana: "Comunitat Valenciana",
    empleo_publico: "Empleo público",
    remoto_europa: "Remoto desde Europa",
  };
  const NOTAS_CATEGORIA = {
    empleo_publico:
      "Muchas convocatorias piden nacionalidad o ciudadanía de la UE: comprueba el requisito de nacionalidad en las bases de cada una.",
  };
  const NOMBRES_FUENTE = {
    arbeitnow: "Arbeitnow",
    remotive: "Remotive",
    boe: "BOE",
    eures: "EURES",
  };

  const $ = (id) => document.getElementById(id);
  let ofertas = [];
  // Quante offerte mostrare per sezione (solo quelle «aperte» con Ver más) e l'ultimo insieme
  // filtrato, per ridisegnare le sezioni senza ricalcolare il filtro.
  let mostradas = {};
  let visiblesActuales = [];

  const normalizar = (texto) =>
    String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Solo enlazamos http(s): il dato arriva da un file, non lo fidiamo come href qualsiasi.
  const urlSegura = (url) =>
    typeof url === "string" && /^https?:\/\//.test(url) ? url : null;

  // «AAAA-MM-DD» letto come data locale, per non spostarla di un giorno col fuso orario.
  const fechaLarga = (iso) => {
    const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!partes) return "";
    const fecha = new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3]));
    return fecha.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  };

  const elemento = (tag, texto, clase) => {
    const el = document.createElement(tag);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
  };

  const etiqueta = (texto, clase) => elemento("span", texto, `etiqueta ${clase}`);

  function tarjeta(o) {
    const li = elemento("li", undefined, "oferta");
    const titulo = elemento("h3", undefined, "oferta-titulo");
    const enlace = urlSegura(o.url);
    if (enlace) {
      const a = elemento("a", o.titulo || "Oferta sin título");
      a.href = enlace;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.appendChild(elemento("span", " (se abre en otra pestaña)", "sr"));
      titulo.appendChild(a);
    } else {
      titulo.textContent = o.titulo || "Oferta sin título";
    }
    li.appendChild(titulo);

    const meta = [o.empresa, o.lugar].filter(Boolean).join(" · ");
    if (meta) li.appendChild(elemento("p", meta, "oferta-meta"));

    const pie = elemento("p", undefined, "oferta-pie");
    if (o.remoto) pie.appendChild(etiqueta("Remoto", "etiqueta-remoto"));
    pie.appendChild(etiqueta(CATEGORIAS[o.categoria] || "Otra", "etiqueta-cat"));
    if (o.fecha) {
      const tiempo = elemento("time", fechaLarga(o.fecha));
      tiempo.dateTime = o.fecha;
      pie.appendChild(tiempo);
    }
    pie.appendChild(elemento("span", NOMBRES_FUENTE[o.fuente] || o.fuente || "", "oferta-fuente"));
    li.appendChild(pie);
    return li;
  }

  // Una sezione per categoria: titolo, conteggio, nota fissa (se c'è), le schede e «Ver más».
  // Il conteggio (n) è sul totale filtrato, non su quelle mostrate.
  function grupo(id, titulo, nota, lista) {
    const seccion = elemento("section", undefined, "grupo");
    seccion.dataset.grupo = id;
    const cabecera = elemento("h2", titulo, "grupo-titulo");
    cabecera.id = `grupo-${id}`;
    cabecera.appendChild(elemento("span", ` (${lista.length})`, "grupo-n"));
    seccion.setAttribute("aria-labelledby", cabecera.id);
    seccion.appendChild(cabecera);
    if (nota) seccion.appendChild(elemento("p", nota, "grupo-nota"));
    const cuantas = Math.min(lista.length, mostradas[id] || LIMITE_POR_SECCION);
    const ul = elemento("ul", undefined, "lista");
    ul.replaceChildren(...lista.slice(0, cuantas).map(tarjeta));
    seccion.appendChild(ul);
    if (cuantas < lista.length) {
      const restantes = lista.length - cuantas;
      const boton = elemento("button", `Ver más (${restantes} restantes)`, "ver-mas");
      boton.type = "button";
      boton.setAttribute("aria-label", `Ver más ofertas de ${titulo} (${restantes} restantes)`);
      boton.addEventListener("click", () => verMas(id, cuantas));
      seccion.appendChild(boton);
    }
    return seccion;
  }

  // Mostra altre offerte nella sezione e porta il focus sulla prima aggiunta (tastiera, lettore).
  function verMas(id, desde) {
    mostradas[id] = desde + LIMITE_POR_SECCION;
    pintarGrupos(visiblesActuales);
    const nueva = document.querySelectorAll(`.grupo[data-grupo="${id}"] li.oferta`)[desde];
    if (nueva) {
      nueva.tabIndex = -1;
      nueva.focus();
    }
  }

  function pintarGrupos(visibles) {
    visiblesActuales = visibles;
    const secciones = [];
    for (const id of Object.keys(CATEGORIAS)) {
      const lista = visibles.filter((o) => o.categoria === id);
      if (lista.length) secciones.push(grupo(id, CATEGORIAS[id], NOTAS_CATEGORIA[id], lista));
    }
    // Categorie che non sono nell'elenco: nessuna offerta si perde in silenzio.
    const otras = visibles.filter((o) => !CATEGORIAS[o.categoria]);
    if (otras.length) secciones.push(grupo("otras", "Otras ofertas", undefined, otras));
    $("lista").replaceChildren(...secciones);
  }

  function filtrar() {
    const palabras = normalizar($("buscar").value.trim()).split(/\s+/).filter(Boolean);
    const categoria = $("categoria").value;
    const visibles = ofertas.filter((o) => {
      if (categoria && o.categoria !== categoria) return false;
      const texto = normalizar([o.titulo, o.empresa, o.lugar].join(" "));
      return palabras.every((p) => texto.includes(p));
    });

    pintarGrupos(visibles);

    const contador = $("contador");
    const vacio = $("vacio");
    if (ofertas.length === 0) {
      contador.textContent = "";
      vacio.textContent = "En esta actualización no hay ofertas.";
      vacio.hidden = false;
    } else {
      const n = visibles.length;
      contador.textContent = `Mostrando ${n} de ${ofertas.length} ${ofertas.length === 1 ? "oferta" : "ofertas"}.`;
      vacio.textContent = "No hay ofertas con ese filtro. Prueba con otra palabra o quita la categoría.";
      vacio.hidden = n > 0;
    }
  }

  function pintarActualizacion(generado) {
    const el = $("actualizacion");
    el.replaceChildren();
    el.classList.remove("viejo");
    const fecha = new Date(generado);
    if (!generado || Number.isNaN(fecha.getTime())) {
      el.textContent = "Fecha de actualización desconocida.";
      el.classList.add("viejo");
      return;
    }
    const cuando = `${fecha.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}, ${fecha.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
    el.appendChild(elemento("strong", `Datos actualizados el ${cuando}.`));
    // La soglia si confronta in millisecondi: arrotondare prima i giorni la sposterebbe in avanti.
    const milisegundos = Date.now() - fecha.getTime();
    if (milisegundos > DIAS_LIMITE_VIEJO * MS_DIA) {
      const dias = Math.floor(milisegundos / MS_DIA);
      el.classList.add("viejo");
      el.appendChild(elemento("span", ` Hace ${dias} días: pueden faltar ofertas o alguna ya no estar disponible.`));
    }
  }

  // Stato di una fonte: letta, letta in parte (le offerte già lette restano), o non disponibile.
  function estadoFuente(f) {
    const n = Number(f.n) || 0;
    const plural = n === 1 ? "oferta" : "ofertas";
    if (f.estado === "ok") return elemento("span", `${n} ${plural} en esta actualización.`, "estado");
    if (n > 0) {
      return elemento(
        "span",
        `Lectura incompleta: ${n} ${plural} en esta actualización; el resto de la fuente no se pudo leer.`,
        "estado estado-error"
      );
    }
    return elemento("span", "No disponible en esta actualización; sus ofertas no aparecen.", "estado estado-error");
  }

  function pintarFuentes(fuentes) {
    const lista = $("atribuciones");
    lista.replaceChildren();
    for (const f of fuentes) {
      const li = elemento("li", undefined, "atribucion");
      const enlace = urlSegura(f.url);
      if (enlace) {
        const a = elemento("a", f.nombre || "Fuente");
        a.href = enlace;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.appendChild(elemento("span", " (se abre en otra pestaña)", "sr"));
        li.appendChild(a);
        li.appendChild(document.createTextNode(". "));
      } else {
        li.appendChild(elemento("strong", `${f.nombre || "Fuente"}. `));
      }
      li.appendChild(document.createTextNode(f.atribucion ? `${f.atribucion} ` : ""));
      li.appendChild(estadoFuente(f));
      if (typeof f.nota === "string" && f.nota) li.appendChild(elemento("span", f.nota, "estado"));
      lista.appendChild(li);
    }
  }

  // Il nome del sito è il campo sitio.nombre di data/catalogo.json (copiato da sitio.json al build).
  // Se manca, o il file non si legge, resta il nome di default: nessun errore in console.
  async function cargarNombreSitio() {
    try {
      const r = await fetch(new URL("data/catalogo.json", RAIZ), { cache: "no-store" });
      if (!r.ok) return;
      const catalogo = await r.json();
      const nombre =
        catalogo && catalogo.sitio && typeof catalogo.sitio.nombre === "string"
          ? catalogo.sitio.nombre.trim()
          : "";
      if (nombre) {
        $("marca").textContent = nombre;
        $("nombre-sitio").textContent = nombre;
      }
    } catch (_) {
      // Senza catalogo.json resta il nome di default («Tamiz», già nell'HTML).
    }
  }

  // Filtri, contatore e «Fuentes» compaiono solo dopo un caricamento riuscito: in caso di errore
  // non si mostrano controlli che non fanno niente né una sezione vuota.
  function mostrarControles(visibile) {
    $("filtros").hidden = !visibile;
    $("contador").hidden = !visibile;
  }

  async function cargarOfertas() {
    try {
      const r = await fetch(new URL("data/empleo.json", RAIZ), { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const doc = await r.json();
      if (!doc || !Array.isArray(doc.ofertas)) throw new Error("formato no válido");
      ofertas = doc.ofertas;
      const fuentes = Array.isArray(doc.fuentes) ? doc.fuentes : [];
      pintarActualizacion(doc.generado_el);
      pintarFuentes(fuentes);
      $("bloque-fuentes").hidden = fuentes.length === 0;
      mostrarControles(true);
      filtrar();
    } catch (_) {
      $("actualizacion").textContent = "Fecha de actualización no disponible.";
      $("actualizacion").classList.add("viejo");
      $("error").hidden = false;
      mostrarControles(false);
      $("vacio").hidden = true;
      $("lista").replaceChildren();
      $("atribuciones").replaceChildren();
      $("bloque-fuentes").hidden = true;
      $("contador").textContent = "";
    }
  }

  // Una modifica della ricerca o della categoria riporta ogni sezione al limite di 10.
  $("buscar").addEventListener("input", () => {
    mostradas = {};
    filtrar();
  });
  $("categoria").addEventListener("change", () => {
    mostradas = {};
    filtrar();
  });
  cargarNombreSitio();
  cargarOfertas();
})();
