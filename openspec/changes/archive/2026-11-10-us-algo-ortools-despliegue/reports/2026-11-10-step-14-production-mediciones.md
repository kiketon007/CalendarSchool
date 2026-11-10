# Paso 14 (ampliación) - Mediciones de OR-Tools en producción

- Fecha: 2026-11-10
- Cambio: us-algo-ortools-despliegue (archivado)
- Agente: Claude
- Completa `2026-11-10-step-14-production.md`, que dejó sin verificar qué motor encontró cada horario y los tiempos. Esta vez sí se pudo mirar CloudWatch (cuenta `411217898612`, perfil de AWS `calendarschool-prod`, solo lectura).

## Qué se midió y cómo

La persona usuaria generó horarios en https://app.calendarschools.es/horarios con `SCHEDULE_ENGINE=ORTOOLS` (dos veces) y con `BACKTRACKING` (dos veces). Es **siempre el mismo colegio y el mismo problema: 360 sesiones**, así que los tiempos y las puntuaciones se pueden comparar. Los datos salen de:

- el grupo de logs del worker, `/aws/lambda/calendarschool-prod-schedule-worker`, con los eventos `SCHEDULE_GENERATION_COMPLETED` (que llevan `engine`, `duration_ms`, la penalización antes y después de la mejora y `improvement_ms`) y cualquier `ortools_fallback`;
- el grupo de logs de la Lambda de OR-Tools, `/aws/lambda/calendarschool-prod-schedule-ortools`, con los eventos de plataforma `platform.initReport` y `platform.report` (duración, memoria y duración del inicio).

(En Git Bash hay que anteponer `MSYS_NO_PATHCONV=1` a `aws logs … --log-group-name /aws/…`; si no, la ruta se reescribe y AWS la rechaza.)

## Resultados

### Generaciones (worker)

| Hora (UTC) | Motor | Tiempo total | Penalización (inicial → final) | Mejora |
| --- | --- | ---: | --- | ---: |
| 12:04:21 | `BACKTRACKING` (motor por defecto) | 2,0 s | 458 → 305 | 173 ms |
| 12:21:05 | **`ORTOOLS`** (primera tras activarlo, arranque en frío) | **23,9 s** | 454 → 298 | 303 ms |
| 12:22:15 | **`ORTOOLS`** (Lambda ya caliente) | **3,8 s** | 454 → 298 | 174 ms |
| 14:57:40 | `BACKTRACKING` (tras volver al motor por defecto) | 1,9 s | 458 → 305 | 138 ms |
| 15:52:54 | **`ORTOOLS`** (nuevo arranque en frío) | **5,9 s** | 454 → 298 | 288 ms |

- Las tres generaciones con `ORTOOLS` terminaron con `"engine":"ORTOOLS"` y **no hubo ningún `ortools_fallback`** en todo el periodo: la Lambda respondió siempre y su horario pasó la validación.
- Las dos con `BACKTRACKING` confirman, además, el motor por defecto en producción (cubre lo que quedó a medias en la tarea 12.2 de `us-algo-ortools-motor`).

### Lambda de OR-Tools (2048 MB, x86_64, imagen de contenedor)

| Hora (UTC) | Qué fue | Duración | Inicio | Memoria máx. |
| --- | --- | ---: | ---: | ---: |
| 12:20:53 | Primer arranque en frío | — | **`timeout` a los 10 s** (`initReport`) | — |
| 12:21:05 | Esa misma invocación | 11,8 s | (repetido dentro de la invocación) | 426 MB |
| 12:22:15 | Invocación con la función caliente | 3,3 s | — | 514 MB |
| 15:52:53 | Segundo arranque en frío | 3,5 s | **0,9 s** | 426 MB |

## Conclusiones

1. **OR-Tools funciona en producción** de punta a punta: el worker invoca la Lambda, recibe el horario, lo valida, lo mejora y lo guarda con `engine: "ORTOOLS"`, y sin ningún fallo ni alternativa.
2. **No es más rápido que el motor actual para este colegio, y es algo peor en el peor caso.** `BACKTRACKING` tarda unos 2 s; `ORTOOLS` entre 3,8 s (caliente) y 5,9 s (arranque en frío rápido), y 23,9 s en el primer arranque en frío. Coincide con la comparación en local (`us-algo-ortools-motor`, paso 5): para colegios de este tamaño el motor actual no se queda corto.
3. **La calidad del horario es equivalente.** La penalización final es 298 con OR-Tools y 305 con el motor actual (menos es mejor), una diferencia del 2 %, que probablemente sea variación de la búsqueda local de la mejora (la misma en los dos motores) y no una ventaja de OR-Tools; con un solo colegio y tres ejecuciones no se puede afirmar más. OR-Tools solo busca el horario de partida; la mejora con las preferencias es la misma.
4. **El primer arranque en frío de la imagen supera los 10 s de la fase de inicio de Lambda.** Lambda lo trata como un `timeout` del inicio (`initReport`), vuelve a inicializar dentro de la invocación y entrega el resultado (11,8 s). No es un fallo: queda muy por debajo de los límites (5 minutos de la función y 90 s de espera del transporte), pero esa generación tarda ~24 s y el administrador la vería con la barra sin valor. El siguiente arranque en frío fue de solo 0,9 s (probablemente porque la imagen ya estaba en la caché del host; no se ha comprobado), así que el primer caso es el peor que se ha visto.
5. **La memoria no se aprieta.** Usa 426–514 MB de 2048 MB. No se ha ajustado ni medido el efecto de bajar la memoria, porque en Lambda la CPU va unida a la memoria y CP-SAT usa varios hilos; si algún día importa el coste, habría que medirlo.
6. **Recomendación:** mantener `BACKTRACKING` como motor de producción y dejar `ORTOOLS` disponible (la Lambda ya está desplegada y, sin invocaciones, solo cuesta el almacenamiento de la imagen) para un colegio donde el motor actual se quede corto: cambiar es cuestión de la variable `SCHEDULE_ENGINE` y un despliegue, sin tocar código. Si se activara de forma permanente, convendría decidir si el primer arranque en frío de ~24 s es aceptable o si se quiere mitigar (concurrencia aprovisionada, o un aviso previo).

## Estado en que queda producción

La persona usuaria pidió volver a `BACKTRACKING` al terminar esta documentación: ver la ejecución del 2026-11-10 (variable `SCHEDULE_ENGINE=BACKTRACKING` y nuevo despliegue).
