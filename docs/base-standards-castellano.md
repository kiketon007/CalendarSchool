---
description: Este documento contiene todas las reglas y directrices de desarrollo para este proyecto, aplicables a todos los agentes de IA (Claude, Cursor, Codex, Gemini, etc.).
alwaysApply: true
---

## 0. Datos base del proyecto
Los datos basicos del proyecto viven en `docs/base-project.md`. Es importante tenerlos en cuenta y seguir sus directrices


## 1. Principios Fundamentales

- **Tareas pequeñas, una a la vez**: Trabaja siempre en pasos muy pequeños (baby steps), uno a la vez. Nunca avances más de un paso por interacción.
- **Desarrollo Dirigido por Pruebas (TDD)**: Comienza escribiendo pruebas que fallen para cualquier nueva funcionalidad (TDD), siguiendo los detalles de la tarea.
- **Seguridad de Tipos (Type Safety)**: Todo el código debe estar completamente tipado.
- **Nombres Claros**: Utiliza nombres claros y descriptivos para todas las variables y funciones.
- **Cambios Incrementales**: Prioriza los cambios incrementales y enfocados frente a modificaciones grandes y complejas.
- **Cuestionar Asunciones**: Cuestiona siempre las asunciones e inferencias.
- **Detección de Patrones**: Detecta y resalta los patrones de código repetidos.
- **Idioma**:
  - **En inglés**: todo lo que forma parte del código: identificadores (variables, funciones, clases, tipos, componentes, hooks), nombres de ficheros, tablas y columnas de base de datos, rutas de la API, claves de i18n, códigos de error (p. ej. `EMAIL_ALREADY_REGISTERED`) y nombres de tests (`describe`/`it`).
  - **En castellano**: comentarios y JSDoc, documentación, artefactos OpenSpec, mensajes de commit y de pull request, y mensajes de log y de excepciones.
  - **Excepción: los estándares técnicos `docs/*-standards.md`** (`backend-standards.md`, `frontend-standards.md` y `documentation-standards.md`) **y `docs/openspec-tasks-mandatory-steps.md` se mantienen en inglés**, también al actualizarlos. El resto de la documentación y de los ficheros sigue en castellano.
  - **Textos visibles para el usuario**: siempre a través de i18n (`es.json`, `en.json`), nunca escritos directamente en el código.


## 2. Control de Sesión y Resiliencia del Agente

### 2.1. Regla de Interrupción de Bucles (Circuit Breaker)
Para evitar degradaciones infinitas de código o bucles de corrección infructuosos al enfrentarse a errores de compilación o fallos de pruebas unitarias:
- Si un test, comando de compilación o verificación falla **3 veces consecutivas** tras intentar corregirlo, el agente **debe detenerse inmediatamente**.
- Queda prohibido aplicar modificaciones adicionales a ciegas o probar soluciones especulativas tras el tercer fallo.
- El agente debe presentar al usuario:
  1. El log de error exacto y los componentes afectados.
  2. Una lista explicativa de las hipótesis de fallo analizadas.
  3. Una propuesta de intervención o aclaración solicitada al desarrollador antes de reanudar el trabajo.

### 2.2. Gestión del Presupuesto de Contexto (Context Budgeting)
Para garantizar una alta precisión en las respuestas y evitar la degradación de memoria o alucinaciones provocadas por saturación de tokens:
- **Carga Selectiva**: No inspecciones carpetas completas ni leas repositorios enteros de manera indiscriminada. Lee únicamente los archivos directamente requeridos para resolver el paso actual.
- **Carga Progresiva de Habilidades**: Al activar un `SKILL.md`, incluye solo las referencias que impacten la tarea en curso. Omita documentación accesoria no pertinente.
- **Limpieza de Sesión**: Cuando una subtarea sea completada y verificada, resume el estado del cambio y descarta referencias a archivos que ya no vayan a ser modificados en los siguientes pasos.

## 3. Estándares Específicos

Para obtener estándares y directrices detalladas específicas para diferentes áreas del proyecto, consulta:

- [Estándares de Backend](./backend-standards.md) - Desarrollo de APIs, patrones de base de datos, pruebas, seguridad y buenas prácticas de backend.
- [Estándares de Frontend](./frontend-standards.md) - Componentes React, directrices de UI/UX y arquitectura frontend.
- [Estándares de Documentación](./documentation-standards.md) - Estructura de documentación técnica, formato y directrices de mantenimiento, incluyendo estándares de IA como este documento.
- [Pasos Obligatorios para Tareas OpenSpec](./openspec-tasks-mandatory-steps.md) - Lista de comprobación obligatoria y reglas de ejecución al crear o actualizar archivos `tasks.md` de OpenSpec.

## 4. Habilidades del Proyecto (Project Skills)

- Las habilidades residen en `ai-specs/skills`.
- Cuando una solicitud coincida con una habilidad, carga y sigue automáticamente el archivo `SKILL.md` correspondiente antes de continuar.
- Carga también cualquier archivo referenciado en la carpeta de la habilidad (por ejemplo, `references/*.md`) únicamente cuando la tarea lo requiera explícitamente.

## 5. Requisito de Modelo de Planificación

Los flujos de trabajo de planificación deben ejecutarse con razonamiento medio o alto (medium or high reasoning) de Opus.

Este requisito se aplica a:
- `enrich-us`
- `openspec-ff-change`
- `openspec-continue-change`

Antes de iniciar cualquiera de estos flujos de trabajo, verifica que la sesión esté utilizando el razonamiento medio o alto de Opus. Si no es así, **auto-corrígete** añadiendo `"model": "claude-opus-5-5"` y `"effortLevel": "medium"` a `.claude/settings.json` (utiliza la habilidad `update-config` o edítalo directamente) y luego continúa — no te detengas a preguntar al usuario. Ambas claves son necesarias: el esfuerzo por defecto de Opus 5.5 es `medium`. Haz lo mismo para volver a Sonnet medium (`"model": "claude-sonnet-5-5"`, `"effortLevel": "medium"`) en cualquier otro paso.

## 6. Integridad de Enlaces Simbólicos y Portabilidad Multi-Agente

- **Fuente Canónica**: Mantén los artefactos reutilizables en `ai-specs` como la fuente canónica. Las rutas específicas de cada agente (como `.claude` y `.cursor`) deben referenciarlos mediante enlaces simbólicos (symlinks) siempre que sea posible.
- **Seguridad en Actualizaciones**: Cada vez que se renombre, mueva o cambie el sufijo de un archivo, verifica y actualiza todos los enlaces simbólicos que apunten a él antes de considerar completado el cambio.
- **Vinculación de Nuevos Artefactos**: Cada vez que crees un nuevo artefacto que requiera exposición multi-agente (por ejemplo, nuevos agentes o habilidades en `ai-specs`), crea los enlaces simbólicos correspondientes desde las rutas de referencia esperadas por cada agente.
- **Revisión de Personalización Externa**: Cada vez que se introduzca una personalización fuera de `ai-specs`, evalúa si debe trasladarse a `ai-specs` y reemplazarse por enlaces simbólicos desde las ubicaciones originales.
- **Puerta de Finalización (Completion Gate)**: Un cambio se considera incompleto si deja enlaces simbólicos rotos, destinos obsoletos o artefactos canónicos duplicados entre las carpetas de los distintos agentes.

## 7. Actualizaciones Obligatorias de Artefactos OpenSpec para Cambios Posteriores a la Aplicación

Cuando aparezca una nueva solicitud de corrección/cambio después de `opsx:apply` (o `/apply`) y antes de `opsx:archive` (o `/archive`), los agentes deben tratarla primero como una actualización de especificación, no como un "arregla esto rápido" informal. Es el principio central de OpenSpec: la documentación es la única fuente de verdad.

Orden obligatorio:
1. Actualiza los artefactos de cambio OpenSpec actuales afectados (por ejemplo: escenarios, requisitos/especificaciones y `tasks.md`). No añadas tareas como "arreglos de errores" (bugfixes), sino como parte del diseño inicial, por lo tanto en la sección adecuada.
2. Si se requiere regeneración de artefactos, ejecuta el paso OpenSpec correspondiente (`opsx:continue`, `opsx:ff` o equivalente) antes de programar.
3. Implementa el código únicamente después de que los artefactos reflejen la nueva solicitud.
4. Vuelve a ejecutar la verificación con los artefactos actualizados antes de archivar.

No apliques correcciones directas solo en el código dentro de esta ventana sin actualizar los artefactos OpenSpec.