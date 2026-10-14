import { iniciarIdioma, RAIZ } from "./i18n.js";
// La pagina Fuentes: l'elenco delle fonti di ogni scheda, letto da data/catalogo.json (lo produce il build).
// Raggruppato per area, in spagnolo. Nessuna richiesta a terzi, nessuno storage, nessun innerHTML:
// il testo va in textContent e i link sono solo http(s).
(() => {
  iniciarIdioma();
  "use strict";

  // Le etichette delle aree: le stesse di web/js/ui/dom.js (AREAS), nell'ordine in cui si mostrano.
  const AREAS = [
    ["familia", "Familia"], ["vivienda", "Vivienda"], ["empleo", "Empleo"], ["estudios", "Estudios"],
    ["investigacion", "Investigación"], ["impuestos", "Impuestos"], ["salud_cuidados", "Salud y cuidados"],
    ["extranjeria", "Extranjería"], ["emprender", "Emprender"], ["jovenes_ocio", "Jóvenes y ocio"],
    ["servicios_sociales", "Servicios sociales"], ["empleo_publico", "Empleo público"],
  ];
  const NOMBRE_AREA = new Map(AREAS);
  const OTRAS = "Otras";

  const $ = (id) => document.getElementById(id);

  // Solo http(s): il dato arriva da un file, non lo fidiamo come href qualsiasi.
  const urlSegura = (url) => (typeof url === "string" && /^https?:\/\//.test(url) ? url : null);

  // Il testo del link: il sito e il percorso, senza «www» e senza la parte dopo «?» («sede.agenciatributaria.gob.es/Sede/
  // …»). Due pagine dello stesso sito si distinguono così, anche per chi legge con lo schermo.
  const etiqueta = (url) => {
    try {
      const u = new URL(url);
      let ruta = u.pathname;
      try {
        ruta = decodeURI(ruta);
      } catch (e) {
        // percorso non decodificabile: resta com'è
      }
      const resto = ruta.replace(/\/+$/, "");
      return `${u.hostname.replace(/^www\./, "")}${resto}`;
    } catch (e) {
      return url;
    }
  };

  // L'etichetta «Fuente» o «Página oficial» sta prima del link; il link porta l'indirizzo intero nel title.
  const enlace = (url) => {
    const a = document.createElement("a");
    a.textContent = etiqueta(url);
    a.href = url;
    a.title = url;
    a.rel = "noopener";
    return a;
  };

  // Una scheda: nome, organismo, la fonte e, solo se è un'altra pagina, il sito ufficiale.
  const elementoFicha = (f) => {
    const li = document.createElement("li");
    const titulo = document.createElement("strong");
    titulo.textContent = f.nombre;
    li.appendChild(titulo);
    if (typeof f.organismo === "string" && f.organismo) {
      li.appendChild(document.createElement("br"));
      li.appendChild(document.createTextNode(`Organismo: ${f.organismo}.`));
    }
    const fuente = urlSegura(f.fuente);
    const oficial = urlSegura(f.url_oficial);
    if (fuente) {
      li.appendChild(document.createElement("br"));
      li.appendChild(document.createTextNode("Fuente: "));
      li.appendChild(enlace(fuente));
    }
    if (oficial && oficial !== fuente) {
      li.appendChild(document.createElement("br"));
      li.appendChild(document.createTextNode("Página oficial: "));
      li.appendChild(enlace(oficial));
    }
    return li;
  };

  // Le fichas per area, nell'ordine di AREAS; un'area sconosciuta o assente va in fondo, sotto «Otras».
  const agrupa = (fichas) => {
    const grupos = new Map();
    for (const f of fichas) {
      const clave = NOMBRE_AREA.has(f.area) ? f.area : "";
      if (!grupos.has(clave)) grupos.set(clave, []);
      grupos.get(clave).push(f);
    }
    const orden = [...AREAS.map(([k]) => k), ""];
    return orden.filter((k) => grupos.has(k)).map((k) => ({
      nombre: k ? NOMBRE_AREA.get(k) : OTRAS,
      fichas: grupos.get(k).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), "es")),
    }));
  };

  const pintar = (fichas) => {
    const contenedor = $("fuentes-areas");
    const bloques = agrupa(fichas).map((grupo, i) => {
      const seccion = document.createElement("section");
      seccion.className = "tarjeta";
      const id = `area-${i}`;
      seccion.setAttribute("aria-labelledby", id);
      const titulo = document.createElement("h3");
      titulo.id = id;
      titulo.textContent = `${grupo.nombre} (${grupo.fichas.length})`;
      seccion.appendChild(titulo);
      const ul = document.createElement("ul");
      ul.className = "lista fuentes";
      ul.replaceChildren(...grupo.fichas.map(elementoFicha));
      seccion.appendChild(ul);
      return seccion;
    });
    contenedor.replaceChildren(...bloques);
  };

  const iniciar = async () => {
    const estado = $("fuentes-estado");
    try {
      const respuesta = await fetch(new URL("data/catalogo.json", RAIZ));
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const datos = await respuesta.json();
      const fichas = (Array.isArray(datos.fichas) ? datos.fichas : [])
        .filter((f) => f && typeof f.nombre === "string" && f.nombre);
      if (!fichas.length) throw new Error("catálogo vacío");
      pintar(fichas);
      estado.textContent = `Hay ${fichas.length} fichas en el catálogo publicado.`;
    } catch (e) {
      estado.textContent = "No se ha podido cargar la lista de fuentes. Vuelve a intentarlo más tarde.";
    }
  };

  iniciar();
})();
