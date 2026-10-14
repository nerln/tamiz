// Todas las convocatorias: legge data/indice.json (generato al build) e lo mostra con ricerca e filtri.
// Lo stato del plazo si ricalcola qui dalle date di oggi (come estado_plazo in scripts/indice.py).
// Nessuna richiesta a terzi, nessuno storage del browser, nessun innerHTML: il testo va in textContent.
(() => {
  "use strict";

  const TAM_PAGINA = 30;
  const DIAS_DATOS_VIEJOS = 3;
  const AMBITOS = {
    estado: "Estado",
    comunitat: "Comunitat Valenciana",
    local: "Local",
  };
  const $ = (id) => document.getElementById(id);

  let datos = null;
  let mostradas = TAM_PAGINA;

  const hoy = () => {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mes}-${dia}`;
  };

  const normalizar = (texto) =>
    String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  // Le date arrivano come «AAAA-MM-DD»: si mostrano come «DD/MM/AAAA».
  const fechaTexto = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
  };

  // Solo http(s): il dato arriva da un file, non lo fidiamo come href qualsiasi.
  const urlSegura = (url) =>
    typeof url === "string" && /^https?:\/\//.test(url) ? url : null;

  // Punto delle migliaia sempre, anche a quattro cifre: «2.671» come nei testi (toLocaleString("es-ES")
  // scriverebbe «2671» sotto le 10.000 e «27.232» sopra).
  const numero = (n) =>
    Number.isInteger(n) ? (n < 0 ? "-" : "") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";

  // Il modello vuoto che la BDNS lascia nei testi del plazo («abierto desde hasta», «cerrado el día .»):
  // solo parole di modulo e nessuna cifra. Stesse regole di plantilla_vacia() in scripts/indice.py.
  const PALABRAS_PLANTILLA = new Set(["abierto", "abierta", "cerrado", "cerrada", "desde", "hasta", "el", "dia", "a",
    "las", "de", "del", "en", "inicio", "fin", "plazo", "hora", "horas", "periodo", "entrega", "solicitud", "solicitudes",
    "presentacion"]);
  const plantillaVacia = (texto) => {
    const n = normalizar(texto);
    if (!n) return true;
    if (/\d/.test(n)) return false;
    return (n.match(/[a-z]+/g) || []).every((p) => PALABRAS_PLANTILLA.has(p));
  };
  const plazoTexto = (c) =>
    typeof c.plazo_texto === "string" && c.plazo_texto && !plantillaVacia(c.plazo_texto) ? c.plazo_texto : null;

  // Le etichette dei destinatari: solo la BDNS, e solo quando il dettaglio dice chi può chiedere.
  const DESTINATARIOS = {
    personas_fisicas: "Destinatarios: personas físicas según la BDNS",
    personas_y_entidades: "Destinatarios: personas físicas y entidades según la BDNS",
  };

  // Stesse regole di estado_plazo() in scripts/indice.py: decidono le date; il flag BDNS solo quando
  // le date non bastano, e solo se vero; senza l'uno e le altre, «según las bases».
  const calcEstado = (c) => {
    const h = hoy();
    const inicio = typeof c.inicio === "string" ? c.inicio : null;
    const fin = typeof c.fin === "string" ? c.fin : null;
    if (inicio && fin) {
      if (fin < h) return "cerrada";
      if (inicio > h) return "proxima";
      return "abierta";
    }
    if (fin && fin < h) return "cerrada";
    if (inicio && inicio > h) return "proxima";
    if (c.fuente === "BDNS" && c.abierta_bdns === true) return "abierta";
    return "segun_bases";
  };

  const abiertaAhora = (c) => calcEstado(c) === "abierta";
  const proxima = (c) => calcEstado(c) === "proxima";

  const coincide = (c, texto, ambito) => {
    if (ambito !== "todos" && c.ambito !== ambito) return false;
    if (!texto) return true;
    return normalizar(`${c.titulo} ${c.organo || ""}`).includes(texto);
  };

  const enlace = (texto, url) => {
    const a = document.createElement("a");
    a.textContent = texto;
    a.href = url;
    a.rel = "noopener";
    return a;
  };

  const etiqueta = (texto, clase) => {
    const s = document.createElement("span");
    s.className = clase;
    s.textContent = texto;
    return s;
  };

  const textoEstado = (c) => {
    const estado = calcEstado(c);
    if (estado === "abierta") {
      return c.fin ? `Abierta hasta el ${fechaTexto(c.fin)}` : "Abierta según la BDNS (sin fecha de cierre)";
    }
    if (estado === "cerrada") return `Cerrada el ${fechaTexto(c.fin)}`;
    if (estado === "proxima") return `Abre el ${fechaTexto(c.inicio)}`;
    return "Plazo según las bases";
  };

  const tarjetaConvocatoria = (c) => {
    const li = document.createElement("li");
    li.className = "tarjeta";

    const titulo = document.createElement("h4");
    titulo.textContent = c.titulo || "Convocatoria sin título";
    li.appendChild(titulo);

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = [c.organo, AMBITOS[c.ambito]].filter(Boolean).join(" · ");
    li.appendChild(meta);

    const estado = document.createElement("p");
    estado.className = "estado";
    const abierta = calcEstado(c) === "abierta";
    estado.appendChild(etiqueta(textoEstado(c), abierta ? "etiqueta abierta" : "etiqueta"));
    li.appendChild(estado);

    // Senza date, la BDNS dice il suo testo del plazo; se è un modello vuoto, non lo si mostra.
    if (calcEstado(c) === "segun_bases" && c.fuente === "BDNS") {
      const plazo = document.createElement("p");
      plazo.className = "meta";
      const texto = plazoTexto(c);
      plazo.textContent = texto ? `La BDNS dice: ${texto}` : "Plazo: consulta las bases";
      li.appendChild(plazo);
    }

    // «personas físicas» solo se il dettaglio BDNS lo conferma (scripts/indice.py, destinatarios_bdns).
    const destinatarios = document.createElement("p");
    destinatarios.className = "meta";
    destinatarios.textContent = c.fuente === "BDNS" && Object.hasOwn(DESTINATARIOS, c.destinatarios)
      ? DESTINATARIOS[c.destinatarios]
      : "Destinatarios sin verificar: mira las bases";
    li.appendChild(destinatarios);

    const pie = document.createElement("p");
    pie.className = "pie";
    const publicada = fechaTexto(c.publicada);
    pie.textContent = `Fuente: ${c.fuente || "—"}${publicada ? ` · publicada el ${publicada}` : ""}`;
    li.appendChild(pie);

    const enlaces = document.createElement("p");
    enlaces.className = "enlaces";
    const bdns = urlSegura(c.url_bdns);
    const bases = urlSegura(c.url_bases);
    if (bdns) enlaces.appendChild(enlace("Ver en la BDNS", bdns));
    if (bdns && bases) enlaces.appendChild(document.createTextNode(" · "));
    if (bases) enlaces.appendChild(enlace("Bases y texto", bases));
    if (enlaces.childNodes.length) li.appendChild(enlaces);

    return li;
  };

  const tarjetaPrevista = (p) => {
    const li = document.createElement("li");
    li.className = "tarjeta prevista";

    const titulo = document.createElement("h4");
    titulo.textContent = p.titulo;
    li.appendChild(titulo);

    const plazas = document.createElement("p");
    plazas.className = "plazas";
    plazas.textContent = `${numero(p.plazas)} plazas`;
    li.appendChild(plazas);

    const meta = document.createElement("p");
    meta.className = "meta";
    meta.textContent = [p.organo, AMBITOS[p.ambito]].filter(Boolean).join(" · ");
    li.appendChild(meta);

    if (p.plazas_nota) {
      const nota = document.createElement("p");
      nota.textContent = p.plazas_nota;
      li.appendChild(nota);
    }

    if (Array.isArray(p.desglose) && p.desglose.length) {
      // Ogni gruppo («Por tasa», «Por turno») è un taglio a sé del totale: non si sommano fra loro.
      const grupos = new Map();
      p.desglose.forEach((d) => {
        if (!d || typeof d.etiqueta !== "string") return;
        const clave = typeof d.grupo === "string" ? d.grupo : "";
        if (!grupos.has(clave)) grupos.set(clave, []);
        grupos.get(clave).push(d);
      });
      grupos.forEach((items, clave) => {
        if (clave) {
          const titulo2 = document.createElement("p");
          titulo2.className = "nota";
          titulo2.textContent = clave;
          li.appendChild(titulo2);
        }
        const lista = document.createElement("ul");
        lista.className = "desglose";
        items.forEach((d) => {
          const item = document.createElement("li");
          item.textContent = `${d.etiqueta}: ${numero(d.plazas)}`;
          lista.appendChild(item);
        });
        li.appendChild(lista);
      });
    }

    if (p.nota) {
      const nota = document.createElement("p");
      nota.className = "nota";
      nota.textContent = p.nota;
      li.appendChild(nota);
    }

    const pie = document.createElement("p");
    pie.className = "pie";
    const verificado = fechaTexto(p.verificado_el);
    pie.textContent = verificado ? `Fuente verificada el ${verificado}` : "Fuente";
    li.appendChild(pie);

    const url = p.fuente && urlSegura(p.fuente.url);
    if (url) {
      const enlaces = document.createElement("p");
      enlaces.className = "enlaces";
      enlaces.appendChild(enlace(p.fuente.nombre || "Ver la fuente", url));
      li.appendChild(enlaces);
    }

    return li;
  };

  const rellenar = (ulId, vacioId, elementos) => {
    const ul = $(ulId);
    ul.replaceChildren(...elementos);
    $(vacioId).hidden = elementos.length > 0;
  };

  // Le schede dicono sempre quante voci contengono, con i filtri di testo e ambito di adesso.
  const pintarConteos = (todas, previstas) => {
    const n = {
      abiertas: todas.filter(abiertaAhora).length,
      proximas: todas.filter(proxima).length + previstas.length,
      todas: todas.length,
    };
    Object.entries(n).forEach(([clave, valor]) => {
      $(`n-${clave}`).textContent = numero(valor);
    });
    return n;
  };

  // Dalla vista «Todas» si va alle plazas previstas: si cambia il filtro, poi si scorre fino alla sezione.
  const irAPrevistas = (evento) => {
    evento.preventDefault();
    document.querySelector('input[name="plazo"][value="proximas"]').checked = true;
    mostradas = TAM_PAGINA;
    mostrar();
    const titulo = $("titulo-proximas");
    titulo.setAttribute("tabindex", "-1");
    $("proximas").scrollIntoView({ block: "start" });
    titulo.focus({ preventScroll: true });
  };

  // La nota sotto i filtri: in «Todas» dichiara le plazas previstas (con il numero e il link alla sezione),
  // altrove dice quante convocatorias restano fuori dalla vista.
  const pintarNota = (plazo, previstas, fuera, n, cuenta, proximasConv) => {
    const nota = $("nota-fuera");
    nota.replaceChildren();
    if (plazo === "todas") {
      nota.hidden = previstas.length === 0;
      if (previstas.length) {
        const plazas = previstas.reduce((s, p) => s + (Number.isInteger(p.plazas) ? p.plazas : 0), 0);
        const ofertas = previstas.length === 1 ? "oferta" : "ofertas";
        nota.append(`Además, hay ${numero(plazas)} plazas previstas en ${numero(previstas.length)} ${ofertas} de empleo público aprobadas. Están en la sección `);
        const a = enlace("Próximamente", "#proximas");
        a.addEventListener("click", irAPrevistas);
        nota.append(a, ".");
      }
      return;
    }
    nota.hidden = fuera === 0;
    nota.textContent = plazo === "abiertas"
      ? `Esta vista deja fuera ${numero(fuera)} de ${numero(n.todas)} convocatorias: ${numero(cuenta("segun_bases"))} sin fechas en la fuente (plazo según las bases, pueden estar abiertas), ${numero(proximasConv)} que abren más adelante y ${numero(cuenta("cerrada"))} cerradas. Están todas en «Todas».`
      : `Esta vista deja fuera ${numero(fuera)} de ${numero(n.todas)} convocatorias, las que no tienen una fecha de apertura futura. Están todas en «Todas».`;
  };

  const mostrar = () => {
    const plazo = document.querySelector('input[name="plazo"]:checked').value;
    const texto = normalizar($("buscar").value.trim());
    const ambito = $("ambito").value;

    const todas = datos.convocatorias.filter((c) => coincide(c, texto, ambito));
    const previstas = datos.previstas.filter((p) => coincide(p, texto, ambito));
    const n = pintarConteos(todas, previstas);

    $("proximas").hidden = plazo !== "proximas";
    $("convocatorias").hidden = plazo === "proximas";

    // Fuori dalla vista «Todas» si dice quante voci restano fuori, e perché.
    const cuenta = (estado) => todas.filter((c) => calcEstado(c) === estado).length;
    const proximasConv = cuenta("proxima");
    const fuera = n.todas - (plazo === "abiertas" ? n.abiertas : proximasConv);
    pintarNota(plazo, previstas, fuera, n, cuenta, proximasConv);

    if (plazo === "proximas") {
      const lista = todas.filter(proxima).sort((a, b) => (a.inicio || "").localeCompare(b.inicio || ""));
      rellenar("lista-proximas", "vacio-proximas", lista.map(tarjetaConvocatoria));
      rellenar("lista-previstas", "vacio-previstas", previstas.map(tarjetaPrevista));
      $("ver-mas").hidden = true;
      return;
    }

    const lista = plazo === "abiertas" ? todas.filter(abiertaAhora) : todas;
    const visibles = lista.slice(0, mostradas);
    rellenar("lista", "vacio", visibles.map(tarjetaConvocatoria));
    $("contador").textContent = lista.length
      ? `${numero(lista.length)} ${lista.length === 1 ? "convocatoria" : "convocatorias"}${lista.length > visibles.length ? `, se muestran ${numero(visibles.length)}` : ""}`
      : "";
    $("ver-mas").hidden = visibles.length >= lista.length;
  };

  const ESTADO_FUENTE = { ok: "lectura correcta", parcial: "lectura parcial", error: "lectura fallida" };
  const ESTADO_SECCION = { ok: "leída", anterior: "datos anteriores", error: "sin datos" };

  const pintarFuentes = () => {
    const ul = $("fuentes");
    const items = (datos.fuentes || []).map((f) => {
      const li = document.createElement("li");
      const titulo = document.createElement("strong");
      titulo.textContent = f.nombre;
      li.appendChild(titulo);
      li.appendChild(document.createTextNode(` · ${ESTADO_FUENTE[f.estado] || "lectura fallida"}`));
      if (f.estado !== "ok" && f.motivo) {
        const falta = document.createElement("p");
        falta.textContent = `Aviso: ${f.motivo}.`;
        li.appendChild(falta);
      }
      if (Array.isArray(f.secciones) && f.secciones.length) {
        const sub = document.createElement("ul");
        f.secciones.forEach((s) => {
          if (!s || typeof s.nombre !== "string") return;
          const item = document.createElement("li");
          const leida = fechaTexto((s.leida_el || "").slice(0, 10));
          item.textContent = `${s.nombre}: ${ESTADO_SECCION[s.estado] || "sin datos"}, ${numero(s.n || 0)} ${s.n === 1 ? "convocatoria" : "convocatorias"}${leida ? `, lectura del ${leida}` : ""}`;
          sub.appendChild(item);
        });
        li.appendChild(sub);
      }
      if (f.nota) {
        const nota = document.createElement("p");
        nota.textContent = f.nota;
        li.appendChild(nota);
      }
      const at = document.createElement("p");
      at.textContent = f.atribucion || "";
      li.appendChild(at);
      return li;
    });
    ul.replaceChildren(...items);
  };

  const avisosDeDatos = (generado) => {
    const recortadas = Number.isInteger(datos.recortadas) ? datos.recortadas : 0;
    if (recortadas > 0) {
      $("recorte").textContent = `El índice guarda ${numero(datos.convocatorias.length)} de ${numero(datos.total_convocatorias)} convocatorias: quedan fuera ${numero(recortadas)}, las cerradas más antiguas.`;
      $("recorte").hidden = false;
    }
    if (!Number.isNaN(generado.getTime())) {
      const dias = (Date.now() - generado.getTime()) / 86400000;
      if (dias > DIAS_DATOS_VIEJOS) {
        $("viejo").hidden = false;
      }
    }
  };

  const iniciar = async () => {
    try {
      const respuesta = await fetch("data/indice.json", { cache: "no-cache" });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      datos = await respuesta.json();
      if (!datos || !Array.isArray(datos.convocatorias) || !Array.isArray(datos.previstas)) {
        throw new Error("formato inatteso");
      }
    } catch (e) {
      $("actualizacion").hidden = true;
      $("error").hidden = false;
      return;
    }

    const generado = new Date(datos.generado_el);
    $("actualizacion").textContent = Number.isNaN(generado.getTime())
      ? "Datos sin fecha de actualización."
      : `Actualizado el ${generado.toLocaleDateString("es-ES")} a las ${generado.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}.`;

    avisosDeDatos(generado);
    pintarFuentes();
    $("controles").hidden = false;
    mostrar();
  };

  $("buscar").addEventListener("input", () => { mostradas = TAM_PAGINA; if (datos) mostrar(); });
  $("ambito").addEventListener("change", () => { mostradas = TAM_PAGINA; if (datos) mostrar(); });
  document.querySelectorAll('input[name="plazo"]').forEach((r) =>
    r.addEventListener("change", () => { mostradas = TAM_PAGINA; if (datos) mostrar(); })
  );
  $("ver-mas").addEventListener("click", () => { mostradas += TAM_PAGINA; mostrar(); });

  iniciar();
})();
