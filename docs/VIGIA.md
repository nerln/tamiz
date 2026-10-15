# La vigía

La vigía es una comprobación diaria, sin IA, que avisa de las fichas que podrían estar desactualizadas.
No decide nada: solo avisa, y la revisión la hace una persona.

## Qué controla

- **Revisión vencida**: la fecha prevista para revisar la ficha (`revisar_antes_de`) ya ha pasado.
- **Plazo pasado**: el plazo es de fechas concretas y ha terminado.
- **Nueva edición esperada**: la ayuda suele convocarse en un mes concreto (`mes_habitual`), y estamos en ese mes o en el anterior.
- **Posible convocatoria nueva**: en el índice de convocatorias hay una publicada después de la lectura de la ficha, del mismo ámbito (una ficha es municipal si la da un ayuntamiento; si no, se compara con convocatorias estatales y autonómicas), con un título muy parecido al nombre de la ficha: al menos el 80 % de sus palabras significativas (sin el texto entre paréntesis) y al menos dos. Una convocatoria con el mismo código BDNS de la ficha no cuenta.
- **Fuente cambiada**: se compara una huella (sha256) de cada página oficial con la que se guardó al sellar. En una página HTML se usa el texto visible; en un PDF, los bytes. Un cambio cuenta solo si dos lecturas del mismo día dan la misma huella, distinta de la sellada.

## Qué NO hace

- No lee el contenido con IA ni interpreta el texto de las bases.
- No dice si una ayuda encaja con alguien, ni cambia plazos, estados o requisitos.
- No dice qué ha cambiado: un aviso significa «revisa la fuente», no «ha cambiado».
- No vigila las páginas que cambian solas ni las que no se pudieron leer al sellar: no dan avisos, pero salen en `sin_huella` de `vigia.json`, con el motivo, para revisarlas a mano.
- No controla las fuentes sin huella sellada, ni las que no se han podido leer (aparecen aparte, en «no comprobadas»).

## Dónde aparece

- En la ficha de Resultados, con la línea «Puede haber cambiado desde nuestra última revisión» cuando la ficha tiene aviso público.
- En `web/data/vigia.json`, generado en cada build. Ese archivo no se guarda en el repositorio.
- En una issue abierta «Vigía: fichas que revisar» (opción `--issues`, en GitHub Actions). La issue se cierra sola cuando no hay nada que revisar.

## Cómo volver a sellar

Cuando una fuente se ha revisado y su contenido nuevo es correcto, se vuelve a sellar. Cada fuente se lee dos veces, con unos segundos de diferencia:

    python3 scripts/vigia.py --sellar                  # todas las fuentes (tarda varios minutos)
    python3 scripts/vigia.py --sellar --ids id1,id2    # solo algunas fichas

Después se confirma `catalogo/vigia-huellas.json` en el commit.
