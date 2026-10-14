// Il questionario: pantallle, controlli e la scrittura del profilo (perfil v1.1, docs/ESQUEMA.md §2).
// Funzioni pure: niente DOM. Le pantallle sono in ordine; ogni controllo scrive un solo percorso.
// Una pantalla si mostra se almeno un suo controllo serve (campo usato da una scheda) o è fisso.

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Paesi: codice ISO 3166-1 e nome da mostrare. Include la UE, lo SEE, la Svizzera e i paesi
// d'origine più frequenti; un paese che manca si può scegliere con «Otro país» più avanti.
export const PAISES = [
  ["AT", "Austria"], ["BE", "Bélgica"], ["BG", "Bulgaria"], ["CY", "Chipre"], ["CZ", "Chequia"],
  ["DE", "Alemania"], ["DK", "Dinamarca"], ["EE", "Estonia"], ["ES", "España"], ["FI", "Finlandia"],
  ["FR", "Francia"], ["GR", "Grecia"], ["HR", "Croacia"], ["HU", "Hungría"], ["IE", "Irlanda"],
  ["IT", "Italia"], ["LT", "Lituania"], ["LU", "Luxemburgo"], ["LV", "Letonia"], ["MT", "Malta"],
  ["NL", "Países Bajos"], ["PL", "Polonia"], ["PT", "Portugal"], ["RO", "Rumanía"], ["SE", "Suecia"],
  ["SI", "Eslovenia"], ["SK", "Eslovaquia"], ["IS", "Islandia"], ["LI", "Liechtenstein"],
  ["NO", "Noruega"], ["CH", "Suiza"], ["GB", "Reino Unido"], ["US", "Estados Unidos"],
  ["AR", "Argentina"], ["BO", "Bolivia"], ["BR", "Brasil"], ["CL", "Chile"], ["CO", "Colombia"],
  ["CU", "Cuba"], ["DO", "República Dominicana"], ["EC", "Ecuador"], ["SV", "El Salvador"],
  ["GT", "Guatemala"], ["HN", "Honduras"], ["MX", "México"], ["NI", "Nicaragua"], ["PA", "Panamá"],
  ["PY", "Paraguay"], ["PE", "Perú"], ["UY", "Uruguay"], ["VE", "Venezuela"], ["MA", "Marruecos"],
  ["DZ", "Argelia"], ["EG", "Egipto"], ["SN", "Senegal"], ["GH", "Ghana"], ["NG", "Nigeria"],
  ["CM", "Camerún"], ["CN", "China"], ["IN", "India"], ["PK", "Pakistán"], ["PH", "Filipinas"],
  ["UA", "Ucrania"], ["RU", "Rusia"], ["TR", "Turquía"], ["SY", "Siria"], ["AF", "Afganistán"],
].sort((a, b) => a[1].localeCompare(b[1], "es"));

export const CCAA = [
  ["ES-AN", "Andalucía"], ["ES-AR", "Aragón"], ["ES-AS", "Principado de Asturias"],
  ["ES-IB", "Illes Balears"], ["ES-PV", "País Vasco"], ["ES-CN", "Canarias"], ["ES-CB", "Cantabria"],
  ["ES-CL", "Castilla y León"], ["ES-CM", "Castilla-La Mancha"], ["ES-CT", "Cataluña"],
  ["ES-EX", "Extremadura"], ["ES-GA", "Galicia"], ["ES-RI", "La Rioja"], ["ES-MD", "Comunidad de Madrid"],
  ["ES-MC", "Región de Murcia"], ["ES-NC", "Comunidad Foral de Navarra"], ["ES-VC", "Comunitat Valenciana"],
  ["ES-CE", "Ceuta"], ["ES-ML", "Melilla"],
];

export const PROVINCIAS = [
  ["ES-AB", "Albacete"], ["ES-A", "Alicante"], ["ES-AL", "Almería"], ["ES-VI", "Álava"], ["ES-O", "Asturias"],
  ["ES-AV", "Ávila"], ["ES-BA", "Badajoz"], ["ES-PM", "Illes Balears"], ["ES-B", "Barcelona"], ["ES-BU", "Burgos"],
  ["ES-CC", "Cáceres"], ["ES-CA", "Cádiz"], ["ES-S", "Cantabria"], ["ES-CS", "Castellón"], ["ES-CR", "Ciudad Real"],
  ["ES-CO", "Córdoba"], ["ES-C", "A Coruña"], ["ES-CU", "Cuenca"], ["ES-GI", "Girona"], ["ES-GR", "Granada"],
  ["ES-GU", "Guadalajara"], ["ES-SS", "Gipuzkoa"], ["ES-H", "Huelva"], ["ES-HU", "Huesca"], ["ES-J", "Jaén"],
  ["ES-LO", "La Rioja"], ["ES-GC", "Las Palmas"], ["ES-LE", "León"], ["ES-L", "Lleida"], ["ES-LU", "Lugo"],
  ["ES-M", "Madrid"], ["ES-MA", "Málaga"], ["ES-MU", "Murcia"], ["ES-NA", "Navarra"], ["ES-OR", "Ourense"],
  ["ES-P", "Palencia"], ["ES-PO", "Pontevedra"], ["ES-SA", "Salamanca"], ["ES-TF", "Santa Cruz de Tenerife"],
  ["ES-SG", "Segovia"], ["ES-SE", "Sevilla"], ["ES-SO", "Soria"], ["ES-T", "Tarragona"], ["ES-TE", "Teruel"],
  ["ES-TO", "Toledo"], ["ES-V", "Valencia"], ["ES-VA", "Valladolid"], ["ES-BI", "Bizkaia"], ["ES-ZA", "Zamora"],
  ["ES-Z", "Zaragoza"], ["ES-CE", "Ceuta"], ["ES-ML", "Melilla"],
].sort((a, b) => a[1].localeCompare(b[1], "es"));

export const TRAMOS = [
  ["cero", "Nada (0 €)"], ["hasta_6000", "Hasta 6.000 €"], ["de_6001_a_9000", "De 6.001 a 9.000 €"],
  ["de_9001_a_12000", "De 9.001 a 12.000 €"], ["de_12001_a_15000", "De 12.001 a 15.000 €"],
  ["de_15001_a_18000", "De 15.001 a 18.000 €"], ["de_18001_a_21000", "De 18.001 a 21.000 €"],
  ["de_21001_a_25000", "De 21.001 a 25.000 €"], ["de_25001_a_30000", "De 25.001 a 30.000 €"],
  ["de_30001_a_40000", "De 30.001 a 40.000 €"], ["de_40001_a_50000", "De 40.001 a 50.000 €"],
  ["de_50001_a_70000", "De 50.001 a 70.000 €"], ["mas_de_70000", "Más de 70.000 €"],
];
const TRAMO_RANGO = {
  cero: [0, 0], hasta_6000: [1, 6000], de_6001_a_9000: [6001, 9000], de_9001_a_12000: [9001, 12000],
  de_12001_a_15000: [12001, 15000], de_15001_a_18000: [15001, 18000], de_18001_a_21000: [18001, 21000],
  de_21001_a_25000: [21001, 25000], de_25001_a_30000: [25001, 30000], de_30001_a_40000: [30001, 40000],
  de_40001_a_50000: [40001, 50000], de_50001_a_70000: [50001, 70000], mas_de_70000: [70001, Infinity],
};

// Dipendenze: un campo calc.* usa questi percorsi del profilo (docs/ESQUEMA.md §3-§4.3).
const DEPENDENCIAS = {
  "calc.edad": ["persona.anio_nacimiento", "persona.mes_nacimiento"],
  "calc.anios_residencia_legal": ["situacion_administrativa.residencia_legal_desde"],
  "calc.meses_residencia_legal": ["situacion_administrativa.residencia_legal_desde"],
  "calc.anios_empadronado": ["residencia.empadronado_desde"],
  "calc.meses_empadronado": ["residencia.empadronado_desde"],
  "calc.num_hijos": ["hogar.hijos"],
  "calc.hijos_menores_3": ["hogar.hijos"],
  "calc.hijos_menores_18": ["hogar.hijos"],
  "calc.hijos_menores_25": ["hogar.hijos"],
  "calc.ingresos_individuales": ["ingresos.individual.tramo", "ingresos.individual.importe"],
  "calc.ingresos_hogar": ["ingresos.hogar.tramo", "ingresos.hogar.importe", "ingresos.individual.tramo",
    "ingresos.individual.importe", "hogar.miembros"],
  "calc.ingresos_hogar_por_miembro": ["hogar.miembros", "ingresos.hogar.tramo", "ingresos.hogar.importe",
    "ingresos.individual.tramo", "ingresos.individual.importe"],
  "calc.patrimonio_sin_vivienda": ["ingresos.patrimonio_sin_vivienda.tramo",
    "ingresos.patrimonio_sin_vivienda.importe"],
};

// Campi che una scheda legge (anche dentro gruppi), più le dipendenze dei calc.*.
export function camposUsados(catalogo) {
  const usati = new Set();
  const scendi = (nodo) => {
    if (!nodo || typeof nodo !== "object") return;
    if (typeof nodo.campo === "string") {
      usati.add(nodo.campo);
      for (const d of DEPENDENCIAS[nodo.campo] || []) usati.add(d);
    }
    for (const figlio of [...(nodo.all_of || []), ...(nodo.any_of || [])]) scendi(figlio);
  };
  for (const f of Array.isArray(catalogo?.fichas) ? catalogo.fichas : []) {
    for (const r of Array.isArray(f.requisitos) ? f.requisitos : []) scendi(r);
  }
  return usati;
}

// Lettura e scrittura di un percorso puntato. Un valore undefined o null cancella il percorso
// e svuota gli oggetti rimasti vuoti: il profilo non contiene mai null (§2.1).
export function leer(perfil, path) {
  let cur = perfil;
  for (const k of path.split(".")) {
    if (!cur || typeof cur !== "object" || !(k in cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

export function escribir(perfil, path, valor) {
  const partes = path.split(".");
  const ultimo = partes.pop();
  const radice = { ...perfil };
  let cur = radice;
  const cammino = [radice];
  for (const k of partes) {
    const nuovo = cur[k] && typeof cur[k] === "object" && !Array.isArray(cur[k]) ? { ...cur[k] } : {};
    cur[k] = nuovo;
    cur = nuovo;
    cammino.push(nuovo);
  }
  if (valor === undefined || valor === null) delete cur[ultimo];
  else cur[ultimo] = valor;
  // Svuota dal fondo gli oggetti rimasti vuoti (tranne la radice).
  for (let i = cammino.length - 1; i > 0; i--) {
    if (Object.keys(cammino[i]).length === 0) {
      const padre = cammino[i - 1];
      delete padre[partes[i - 1]];
    }
  }
  return radice;
}

const NO_ALQUILER = ["propiedad", "hipoteca", "cedida", "sin_hogar", "otro"];

// Opzioni della situazione amministrativa, come sulla tarjeta (docs/ESQUEMA.md §2.4).
// «null» = «Otra situación o prefiero no decirlo»: il campo resta vuoto.
export const OPC_DOCUMENTO = [
  ["nacional", "Tengo la nacionalidad española (DNI)"],
  ["ciudadano_ue", "Ciudadano/a de la UE, del EEE o de Suiza con certificado de registro (el certificado verde)"],
  ["ciudadano_ue_permanente", "Ciudadano/a de la UE, del EEE o de Suiza con certificado de residencia permanente"],
  ["ciudadano_ue_sin_registro", "Ciudadano/a de la UE, del EEE o de Suiza, todavía sin certificado de registro"],
  ["familiar_ue", "Tarjeta de residencia de familiar de ciudadano de la Unión"],
  ["familiar_ue_permanente", "Tarjeta de residencia permanente de familiar de ciudadano de la Unión"],
  ["residencia_temporal", "Residencia temporal (TIE): por trabajo, arraigo, reagrupación familiar u otro motivo"],
  ["residencia_larga_duracion", "Residencia de larga duración (TIE). Antes se llamaba «residencia permanente»"],
  ["residencia_larga_duracion_ue", "Residencia de larga duración-UE (TIE)"],
  ["estancia_estudios", "Autorización por estudios, movilidad de estudiantes o prácticas"],
  ["proteccion_internacional_solicitante", "He pedido protección internacional (documento de solicitante, la «tarjeta roja»)"],
  ["proteccion_internacional", "Tengo asilo o protección subsidiaria concedida"],
  ["proteccion_temporal", "Protección temporal (por ejemplo, personas desplazadas de Ucrania)"],
  ["residencia_art50_tue", "Documento de residencia artículo 50 TUE (Reino Unido)"],
  [null, "Otra situación o prefiero no decirlo"],
  ["no_lo_se", "No lo sé"],
];

export const OPC_SITUACIONES = [
  ["asalariado", "Trabajo con contrato (por cuenta ajena)"],
  ["autonomo", "Trabajo como autónomo/a (por cuenta propia)"],
  ["desempleado", "No tengo trabajo y lo busco"],
  ["estudiante", "Estudio"],
  ["inactivo", "No trabajo ni busco trabajo"],
  ["jubilado", "Estoy jubilado/a"],
  ["otro", "Otra situación"],
  ["no_lo_se", "No lo sé"],
];

export const OPC_CONTRATO = [
  ["indefinido", "Indefinido"], ["fijo_discontinuo", "Fijo discontinuo"],
  ["temporal", "Temporal (de duración determinada)"], ["predoctoral", "Contrato predoctoral (Ley de la Ciencia)"],
  ["cientifico_tecnico", "Contrato de actividades científico-técnicas (ligado a un proyecto)"],
  ["postdoctoral", "Contrato postdoctoral o de acceso de personal investigador doctor"],
  ["formativo", "Contrato formativo o de prácticas"], ["funcionario", "Soy funcionario/a"],
  ["ninguno", "No tengo contrato"], ["otro", "Otro tipo de contrato"], ["no_lo_se", "No lo sé"],
];

export const OPC_NIVEL = [
  ["ninguno", "Sin estudios terminados"], ["primaria", "Educación primaria"], ["eso", "ESO o equivalente"],
  ["bachillerato", "Bachillerato"], ["fp_medio", "FP de grado medio"], ["fp_superior", "FP de grado superior"],
  ["grado", "Grado, licenciatura o diplomatura"], ["master", "Máster"], ["doctorado", "Doctorado"],
  ["otro", "Otros estudios"], ["no_lo_se", "No lo sé"],
];

export const OPC_MATRICULA = [
  ["ninguno", "Ahora no estudio"], ["secundaria", "ESO o Bachillerato"], ["fp", "Formación Profesional"],
  ["grado", "Grado"], ["master", "Máster"], ["doctorado", "Doctorado"], ["idiomas", "Idiomas"],
  ["otro", "Otros estudios"], ["no_lo_se", "No lo sé"],
];

export const OPC_HOMOLOGACION = [
  ["no_pedida", "No la he pedido"], ["en_tramite", "La he pedido y está en trámite"],
  ["concedida", "Me han dado la homologación o la equivalencia"], ["denegada", "Me la han denegado"],
  ["no_lo_se", "No lo sé"],
];

export const OPC_PAREJA = [
  ["no", "No vivo en pareja"], ["matrimonio", "Casado/a"], ["pareja_de_hecho", "Pareja de hecho registrada"],
  ["pareja_sin_registrar", "Pareja sin registrar"], ["prefiero_no_decirlo", "Prefiero no decirlo"],
];

export const OPC_FAMILIA = [
  ["no", "No"], ["general", "Sí, categoría general"], ["especial", "Sí, categoría especial"],
  ["no_lo_se", "No lo sé"],
];

export const OPC_REGIMEN = [
  ["alquiler", "Alquilo una vivienda entera"], ["habitacion", "Alquilo una habitación"],
  ["propiedad", "Es mía y está pagada"], ["hipoteca", "Es mía y pago hipoteca"],
  ["cedida", "Vivo sin pagar alquiler (me la dejan familia u otras personas)"],
  ["sin_hogar", "No tengo vivienda"], ["otro", "Otra situación"], ["no_lo_se", "No lo sé"],
];

export const OPC_ENTIDAD = [
  ["universidad_publica", "Universidad pública"], ["universidad_privada", "Universidad privada"],
  ["organismo_publico_investigacion", "Organismo público de investigación (por ejemplo, el CSIC)"],
  ["centro_investigacion", "Fundación o centro de investigación"],
  ["hospital_o_instituto_sanitario", "Hospital o instituto de investigación sanitaria"],
  ["administracion_publica", "Administración pública"], ["empresa", "Empresa"],
  ["ong_o_fundacion", "ONG, asociación o fundación"], ["centro_formacion", "Centro de FP, escuela de idiomas o academia"],
  ["otro", "Otra"], ["no_lo_se", "No lo sé"],
];

export const OPC_SEXO = [
  ["mujer", "Mujer"], ["hombre", "Hombre"], ["otro", "Otra respuesta"], ["prefiero_no_decirlo", "Prefiero no decirlo"],
];

export const OPC_AMBITO = [["EU", "Unión Europea"], ["ES", "España (todo el territorio)"],
  ...CCAA.filter(([c]) => c !== "ES-CE" && c !== "ES-ML"),
  ["ES-CE", "Ceuta"], ["ES-ML", "Melilla"], ["no_lo_se", "No lo sé"]];

// Ogni controllo: { tipo, campo, etichetta, … , siempre?, si?(perfil) }.
// Tipi: anio, mes, entero, fecha, bool, radio, lista, pais, paises, tramo, hijos, texto, select.
export const PANTALLAS = [
  { id: "anio", titulo: "¿En qué año naciste?", porque: "La edad decide a qué ayudas puedes pedir. Basta el año; si sabes el mes, lo añadimos en la siguiente pantalla.",
    controles: [{ tipo: "anio", campo: "persona.anio_nacimiento", siempre: true, etiqueta: "Año de nacimiento", min: 1900, max: 2100 }] },
  { id: "mes", titulo: "¿En qué mes naciste?", porque: "Cuando la edad está justo en el límite de una ayuda, el mes puede cambiar la respuesta. Es opcional.",
    controles: [{ tipo: "select", campo: "persona.mes_nacimiento", etiqueta: "Mes de nacimiento",
      opciones: [...MESES.map((m, i) => [i + 1, m[0].toUpperCase() + m.slice(1)]), ["no_lo_se", "No lo sé"]] }] },
  { id: "nacionalidad", titulo: "¿Qué nacionalidades tienes?", porque: "Muchas ayudas dependen de la nacionalidad o del país de origen. Puedes añadir más de una.",
    controles: [{ tipo: "paises", campo: "persona.nacionalidades", siempre: true, etiqueta: "Nacionalidades",
      nadie: [[], "No tengo ninguna nacionalidad"] }] },
  { id: "origen", titulo: "¿De qué países eras cuando naciste?", porque: "Algunas ayudas tienen acuerdos con países concretos según el origen de nacimiento.",
    controles: [{ tipo: "paises", campo: "vinculos.paises_origen", etiqueta: "Países de origen", nadie: [[], "Ninguno de ellos"] }] },
  { id: "sexo", titulo: "¿Cómo te identificas?", porque: "Solo lo preguntamos porque alguna ayuda lo tiene en cuenta. Puedes no contestar.",
    controles: [{ tipo: "radio", campo: "persona.sexo", etiqueta: "Sexo", opciones: OPC_SEXO }] },
  { id: "residencia", titulo: "¿Dónde vives ahora?", porque: "Dónde vives decide qué ayudas son tuyas: las de tu comunidad, las de tu municipio y las del Estado.",
    controles: [
      { tipo: "radio", campo: "residencia.pais", siempre: true, etiqueta: "País de residencia",
        opciones: [["ES", "En España"], ["otro", "En otro país"], ["no_lo_se", "No lo sé"]] },
      { tipo: "pais", campo: "residencia.pais", siempre: true, etiqueta: "¿En qué país vives?",
        si: (p) => leer(p, "residencia.pais") === "otro" },
      { tipo: "select", campo: "residencia.region", siempre: true, etiqueta: "Comunidad autónoma",
        opciones: [...CCAA, ["no_lo_se", "No lo sé"]], si: (p) => leer(p, "residencia.pais") === "ES" },
    ] },
  { id: "domicilio", titulo: "¿En qué provincia y municipio?", porque: "Algunas ayudas son de la provincia o del municipio. El código INE del municipio tiene 5 cifras.",
    controles: [
      { tipo: "select", campo: "residencia.provincia", etiqueta: "Provincia", opciones: [...PROVINCIAS, ["no_lo_se", "No lo sé"]],
        si: (p) => leer(p, "residencia.pais") === "ES" },
      { tipo: "texto", campo: "residencia.municipio_ine", etiqueta: "Código INE del municipio (5 cifras)", patron: /^\d{5}$/,
        error: "El código INE tiene 5 cifras.", si: (p) => leer(p, "residencia.pais") === "ES" },
    ] },
  { id: "empadronado", titulo: "¿Desde cuándo estás empadronado/a donde vives?", porque: "El empadronamiento en un municipio cuenta en muchas ayudas. Escribe el año, o el año y el mes (por ejemplo 2019 o 2019-06).",
    controles: [{ tipo: "fecha", campo: "residencia.empadronado_desde", etiqueta: "Empadronado/a desde" }] },
  { id: "documento", titulo: "¿Qué documento tienes?", porque: "El documento que tienes decide a qué ayudas puedes acceder. Elige el que aparece en tu tarjeta o certificado.",
    controles: [{ tipo: "radio", campo: "situacion_administrativa.tipo", siempre: true, etiqueta: "Documento", opciones: OPC_DOCUMENTO, ong_si_otro: true }] },
  { id: "autorizacion", titulo: "¿Tu documento te permite trabajar?", porque: "Algunas ayudas exigen poder trabajar en España.",
    controles: [{ tipo: "bool", campo: "situacion_administrativa.autoriza_trabajar", etiqueta: "Puedo trabajar con mi documento" }] },
  { id: "fechas_documento", titulo: "Fechas de tu documento y de tu residencia", porque: "Cuántos años llevas con residencia legal, y cuándo empieza y acaba tu documento, son datos que algunas ayudas piden.",
    controles: [
      { tipo: "fecha", campo: "situacion_administrativa.residencia_legal_desde", etiqueta: "Residencia legal en España desde" },
      { tipo: "fecha", campo: "situacion_administrativa.documento_desde", etiqueta: "Fecha de concesión del documento" },
      { tipo: "fecha", campo: "situacion_administrativa.documento_hasta", etiqueta: "Fecha de caducidad del documento", futuro: true },
    ] },
  { id: "situacion", titulo: "¿Qué haces ahora?", porque: "Puedes marcar varias opciones: por ejemplo, trabajar y estudiar a la vez.",
    controles: [{ tipo: "lista", campo: "empleo.situaciones", siempre: true, etiqueta: "Situación", opciones: OPC_SITUACIONES }] },
  { id: "contrato", titulo: "¿Qué tipo de contrato tienes?", porque: "Si no trabajas, responde con tu último contrato. Algunas ayudas dependen del tipo de contrato y de cuándo termina.",
    controles: [
      { tipo: "radio", campo: "empleo.tipo_contrato", etiqueta: "Tipo de contrato", opciones: OPC_CONTRATO },
      { tipo: "fecha", campo: "empleo.contrato_hasta", etiqueta: "El contrato termina el", futuro: true },
    ] },
  { id: "desempleo", titulo: "Tu situación de desempleo", porque: "La inscripción como demandante de empleo, la prestación y las cotizaciones cuentan en las ayudas por desempleo.",
    controles: [
      { tipo: "bool", campo: "empleo.inscrito_demandante", etiqueta: "Estoy inscrito/a como demandante de empleo" },
      { tipo: "bool", campo: "empleo.cobra_prestacion", etiqueta: "Ahora cobro una prestación o un subsidio por desempleo" },
      { tipo: "entero", campo: "empleo.meses_cotizados_6_anios", etiqueta: "Meses cotizados en los últimos 6 años", min: 0, max: 72 },
    ] },
  { id: "nivel", titulo: "¿Cuál es tu título más alto terminado?", porque: "El nivel de estudios decide a qué becas y contratos puedes presentarte.",
    controles: [{ tipo: "radio", campo: "estudios.nivel_max", siempre: true, etiqueta: "Nivel de estudios", opciones: OPC_NIVEL }] },
  { id: "matricula", titulo: "¿Qué estudias ahora?", porque: "Muchas becas y contratos piden estar matriculado en un tipo de estudio concreto.",
    controles: [{ tipo: "radio", campo: "estudios.matriculado_en", etiqueta: "Estudios actuales", opciones: OPC_MATRICULA }] },
  { id: "titulo", titulo: "¿Tu título más alto es de otro país?", porque: "Un título obtenido fuera de España puede necesitar homologación o equivalencia.",
    controles: [
      { tipo: "bool", campo: "estudios.titulo_extranjero", etiqueta: "Lo obtuve fuera de España" },
      { tipo: "pais", campo: "estudios.titulo_pais", etiqueta: "País donde lo obtuviste", si: (p) => leer(p, "estudios.titulo_extranjero") !== false },
      { tipo: "radio", campo: "estudios.homologacion", etiqueta: "Homologación o equivalencia", opciones: OPC_HOMOLOGACION, si: (p) => leer(p, "estudios.titulo_extranjero") !== false },
    ] },
  { id: "hogar", titulo: "¿Con cuántas personas vives?", porque: "Contamos a la familia que vive contigo, incluida tú. Las personas que comparten piso sin ser familia no cuentan.",
    controles: [
      { tipo: "entero", campo: "hogar.miembros", etiqueta: "Personas de la familia que viven contigo (tú incluida)", min: 1, max: 30 },
      { tipo: "radio", campo: "hogar.pareja", etiqueta: "Pareja", opciones: OPC_PAREJA },
    ] },
  { id: "hijos", titulo: "¿Tienes hijos o hijas que viven contigo o están a tu cargo?", porque: "Cuenta a los hijos aunque sean mayores de edad. Para cada uno basta el año de nacimiento.",
    controles: [{ tipo: "hijos", campo: "hogar.hijos", etiqueta: "Hijos e hijas" }] },
  { id: "familia", titulo: "Tu familia", porque: "Un título de familia numerosa o ser familia monoparental cambian las condiciones de algunas ayudas.",
    controles: [
      { tipo: "bool", campo: "hogar.monoparental", etiqueta: "Soy el único adulto a cargo de hijos menores" },
      { tipo: "radio", campo: "hogar.familia_numerosa", etiqueta: "Título de familia numerosa", opciones: OPC_FAMILIA },
    ] },
  { id: "vivienda", titulo: "¿Cómo es tu vivienda?", porque: "El régimen de la vivienda decide algunas ayudas de alquiler y de vivienda.",
    controles: [
      { tipo: "radio", campo: "vivienda.regimen", etiqueta: "Régimen de la vivienda", opciones: OPC_REGIMEN },
      { tipo: "entero", campo: "vivienda.alquiler_mensual", etiqueta: "Alquiler mensual que pagas tú (€)", min: 0, max: 100000,
        si: (p) => !NO_ALQUILER.includes(leer(p, "vivienda.regimen")) },
      { tipo: "bool", campo: "vivienda.contrato_a_su_nombre", etiqueta: "El contrato de alquiler está a mi nombre",
        si: (p) => !NO_ALQUILER.includes(leer(p, "vivienda.regimen")) },
    ] },
  { id: "ingresos", titulo: "Tus ingresos del año pasado", porque: "Tus ingresos brutos (antes de impuestos) sirven para calcular prestaciones como el ingreso mínimo vital (IMV) o algunas deducciones. Si no sabes la cifra exacta, elige un tramo.",
    controles: [{ tipo: "tramo", base: "ingresos.individual", etiqueta: "Ingresos brutos anuales de la persona" }] },
  { id: "ingresos_hogar", titulo: "Ingresos de tu familia", porque: "Los ingresos de tu familia sirven para calcular prestaciones como el ingreso mínimo vital (IMV) o algunas deducciones. Son los ingresos brutos de todas las personas de tu familia que viven contigo.",
    controles: [{ tipo: "tramo", base: "ingresos.hogar", etiqueta: "Ingresos brutos anuales de la familia",
      si: (p) => leer(p, "hogar.miembros") !== 1 }] },
  { id: "patrimonio", titulo: "Ahorros y bienes", porque: "Ahorros e inversiones, sin contar la casa en la que vives. Algunas ayudas tienen un límite.",
    controles: [{ tipo: "tramo", base: "ingresos.patrimonio_sin_vivienda", etiqueta: "Ahorros y bienes, sin la casa en la que vives" }] },
  { id: "trabajo_entidad", titulo: "¿Dónde trabajas?", porque: "Algunas ayudas están ligadas al tipo de entidad y al territorio donde trabajas.",
    controles: [
      { tipo: "radio", campo: "vinculos.entidad_trabajo.tipo", etiqueta: "Tipo de entidad", opciones: OPC_ENTIDAD },
      { tipo: "select", campo: "vinculos.entidad_trabajo.ambito", etiqueta: "Territorio de la entidad", opciones: OPC_AMBITO },
    ] },
  { id: "estudios_entidad", titulo: "¿Dónde estudias?", porque: "Algunas ayudas están ligadas al tipo de centro donde estudias y a su territorio.",
    controles: [
      { tipo: "radio", campo: "vinculos.entidad_estudios.tipo", etiqueta: "Tipo de centro", opciones: OPC_ENTIDAD },
      { tipo: "select", campo: "vinculos.entidad_estudios.ambito", etiqueta: "Territorio del centro", opciones: OPC_AMBITO },
    ] },
  { id: "cotizacion", titulo: "¿Has trabajado y cotizado en otro país?", porque: "Los años cotizados en otro país pueden contar para algunas prestaciones.",
    controles: [{ tipo: "paises", campo: "vinculos.paises_cotizacion", etiqueta: "Países donde has cotizado", nadie: [[], "No he cotizado en otro país"] }] },
  { id: "permiso", titulo: "¿En qué país sacaste el permiso de conducir?", porque: "Algunas ayudas de movilidad o de empleo lo piden.",
    controles: [{ tipo: "pais", campo: "vinculos.permiso_conducir_pais", etiqueta: "País del permiso de conducir" }] },
];

// Campi di tutte le pantalle (per l'ordine di «faltan» → domanda).
export function pantallaPara(path) {
  return PANTALLAS.find((p) => p.controles.some((c) => c.campo === path || c.base === path.replace(/\.(tramo|importe)$/, ""))) || null;
}

// Un controllo si mostra se è fisso (siempre) o se un campo che legge una scheda c'è; poi si applica si(perfil).
export function controlesVisibles(pantalla, perfil, usados) {
  return pantalla.controles.filter((c) => {
    const campos = c.campo ? [c.campo] : [`${c.base}.tramo`, `${c.base}.importe`];
    const serve = c.siempre || campos.some((x) => usados.has(x));
    return serve && (!c.si || c.si(perfil));
  });
}

// Pantalla visibile: almeno un controllo visibile. Restituisce l'elenco in ordine.
export function pantallasVisibles(perfil, usados) {
  return PANTALLAS.filter((p) => controlesVisibles(p, perfil, usados).length > 0);
}

// Il campo da chiedere per un dato che manca in una scheda. Con una persona sola la domanda sul reddito
// della famiglia non si mostra (controllo «si» di ingresos_hogar): il dato da chiedere è il reddito individuale.
export function campoDeDomanda(path, perfil) {
  if (path.startsWith("ingresos.hogar.") && leer(perfil, "hogar.miembros") === 1) {
    return path.replace(/^ingresos\.hogar\./, "ingresos.individual.");
  }
  return path;
}

// Controlli di un campo ISO per il profilo (tramo + importe), per scrivere e per riepilogare.
export const EJEMPLOS = { lucia: "ejemplos/perfil-lucia.json", rodrigo: "ejemplos/perfil-rodrigo.json" };

export function tramoDeImporte(importe) {
  for (const [codigo, [lo, hi]] of Object.entries(TRAMO_RANGO)) {
    if (importe >= lo && importe <= hi) return codigo;
  }
  return null;
}
export { TRAMO_RANGO };
