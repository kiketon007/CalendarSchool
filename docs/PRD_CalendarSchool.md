# PRD — CalendarSchool MVP

> **Producto**: CalendarSchool
> **Versión del documento**: 1.0 · Julio 2026
> **Estado**: aprobado para MVP
> **Owner de producto**: equipo CalendarSchool
> **Audiencia de este documento**: equipo de ingeniería (backend, frontend), QA, y cualquier agente de IA que vaya a decomponer este PRD en backlog.

---

## 1. Resumen ejecutivo

CalendarSchool es una aplicación integral para la gestión y optimización de tareas rutinarias de administración escolar, especializada en la normativa y organización de centros educativos de la Comunidad Valenciana.

**Funcionalidades principales:**
- **Generación automática de horarios semanales** coherentes para alumnado y profesorado, respetando todas las restricciones pedagógicas, legales y de disponibilidad del personal.
- **Gestión de comensales de comedor** con cuadrante mensual que registra la asistencia diaria de alumnos al servicio de comida.

### Qué incluye el MVP

**Autenticación y permisos:**
- Registro e inicio de sesión de usuarios con email y contraseña.
- Gestión de sesiones mediante tokens de acceso.

**Gestión de datos maestros:**
- CRUD completo de profesores: datos personales, condición de tutor, especialidades.
- CRUD completo de alumnos: datos personales, curso asignado, inscripción a comedor y estado de beca.
- CRUD completo de cursos: nombre, nivel educativo, clases asociadas (A, B, C, etc.).

**Búsqueda y filtrado:**
- Filtrado de profesores por nombre o apellido.
- Filtrado de alumnos por nombre, apellido o curso.

**Generación de horarios:**
- CRUD completo de restricciones para la creación de horarios (disponibilidades, coordinaciones, especialidades).
- Interfaz para parametrizar restricciones específicas de cada colegio al inicio del curso.
- Algoritmo que genera horarios semanales respetando:
  - Estructura horaria definida (sesiones de 45 minutos, periodos de patio).
  - Incompatibilidades pedagógicas (no duplicidad de asignatura en un mismo día para un grupo).
  - Ubicación simultánea unitaria (un docente no puede estar en dos aulas a la vez).
  - Cargas horarias semanales por asignatura y grupo.
  - Disponibilidades del especialista (días/horas laborales).
  - Descansos obligatorios y coordinaciones del profesorado.
- Exportación de horarios en formato tabla Markdown (compatible con copia a Word).

**Gestión de comedor:**
- Calendario mensual por curso con visualización de alumnos con servicio de comedor.
- Registro diario de asistencia al comedor para cada alumno.
- Filtrado visual de alumnos por estado de asistencia.

### Qué NO incluye el MVP (out of scope explícito)

- Funcionalidades no listadas explícitamente en este documento.
- Aplicación móvil nativa (la interfaz web es responsive y funciona en dispositivos móviles).
- Sincronización bidireccional con sistemas externos (LMS, plataformas de comunicación).
- Generación de reportes avanzados (estadísticas, análisis).
- Reserva o gestión de espacios (aulas, laboratorios).

---

## 2. Usuario objetivo

**Perfil primario**: Personal de gestión educativa, jefatura de estudios y administración escolar de centros de Educación Infantil y Primaria en la Comunidad Valenciana.

**Responsabilidades principales:**
- Crear y mantener actualizada la estructura del centro (profesores, alumnos, cursos).
- Definir restricciones y parámetros pedagógicos y laborales.
- Generar y revisar horarios semanales coherentes.
- Registrar la asistencia de alumnos al servicio de comedor.

**Contexto:**
- Familiaridad con normativa educativa valenciana.
- Necesidad de eficiencia: reducir el tiempo manual de generación de horarios (tarea actualmente tediosa).
- Preocupación por cumplimiento de restricciones laborales y pedagógicas.

---

## 3. Requisitos funcionales

### 3.1 — Autenticación y gestión de cuenta

CalendarSchool requiere que cada usuario tenga una cuenta propia y acceso basado en permiso. Los datos del colegio nunca son visibles para usuarios no autorizados.

- Un visitante puede **crear una cuenta** con email y contraseña, indicando el **nombre de su colegio**. La contraseña debe tener al menos 8 caracteres.
- El registro da de alta el colegio y el usuario queda como su administrador. En el MVP cada colegio tiene un único usuario y sus datos están aislados de los de otros colegios.
- Si el email ya está registrado, el sistema lo indica y ofrece ir al inicio de sesión.
- Un usuario registrado puede **iniciar sesión** con su email y contraseña.
- Un usuario autenticado puede **cerrar sesión**.
- Tras el registro exitoso, el usuario llega a una pantalla de bienvenida (onboarding mínimo) que indica con qué funcionalidad quieres trabajar: gestión de horarios, gestión de comedor, o ambas.
- La sesión se mantiene mediante tokens de acceso. No se requiere "recordar contraseña" ni verificación de email por enlace en el MVP.

### 3.2 — Gestión de profesores (CRUD)

Los profesores son la unidad central de la generación de horarios.

- Un usuario puede **crear un profesor** indicando:
  - Nombre y apellido (obligatorio).
  - Email de contacto (opcional).
  - Número de identidad o ID interno (opcional).
  - **Es tutor**: sí/no (boolean). Si es tutor, se asigna a un curso.
  - **Especialidades**: una lista de áreas que imparte (e.g., Inglés, Educación Física, Religión, Música, etc.).
  - **Restricciones de disponibilidad**: días y horas en los que está disponible, reducciones por coordinación, etc.
- Un usuario puede **ver el listado completo** de profesores del colegio.
- Un usuario puede **editar** cualquier campo de un profesor existente.
- Un usuario puede **borrar** un profesor (con confirmación).
- Un usuario puede **filtrar profesores** por nombre o apellido (búsqueda fuzzy).

### 3.3 — Gestión de alumnos (CRUD)

Los alumnos se organizan por cursos y pueden estar inscritos al servicio de comedor.

- Un usuario puede **crear un alumno** indicando:
  - Nombre y apellido (obligatorio).
  - Número de identidad o ID interno (opcional).
  - **Curso**: asignación a un curso específico (obligatorio).
  - **Inscrito a comedor**: sí/no (boolean).
  - **Con beca de comedor**: sí/no (boolean, solo relevante si está inscrito).
- Un usuario puede **ver el listado completo** de alumnos o filtrado por curso.
- Un usuario puede **editar** cualquier campo de un alumno existente.
- Un usuario puede **borrar** un alumno (con confirmación).
- Un usuario puede **filtrar alumnos** por nombre, apellido o curso (búsqueda fuzzy en nombres).

### 3.4 — Gestión de cursos (CRUD)

Los cursos agrupan alumnos y definen la estructura del centro.

- Un usuario puede **crear un curso** indicando:
  - **Nombre del nivel**: e.g., "Infantil 3 años", "1º Primaria", etc. (obligatorio).
  - **Clases/grupos**: A, B, C, etc. Cada clase es un grupo de alumnos separado (obligatorio, al menos una).
  - **Tutor asignado**: el docente responsable de cada clase (obligatorio).
- Un usuario puede **ver el listado completo** de cursos y sus clases asociadas.
- Un usuario puede **editar** nombre, clases y tutores.
- Un usuario puede **borrar** un curso (solo si no tiene alumnos asignados).

### 3.5 — Gestión de restricciones para horarios (CRUD)

Las restricciones parametrizan cómo genera el algoritmo los horarios respetando la normativa educativa.

- Un usuario puede **crear una restricción**, especificando:
  - **Tipo**: carga horaria por asignatura/grupo, disponibilidad de especialista, descanso obligatorio, coordinación, etc.
  - **Parámetros específicos**: según el tipo (e.g., "Inglés en 1º Primaria: 3 sesiones semanales").
  - **Curso/grupo afectado**: a qué clase aplica.
  - **Profesor afectado**: si aplica a un docente específico.
- Un usuario puede **ver el listado completo** de restricciones activas.
- Un usuario puede **editar** restricciones existentes.
- Un usuario puede **borrar** restricciones.
- Las restricciones reflejan completamente la estructura de la Comunidad Valenciana:
  - Horarios diferenciados para Infantil y Primaria.
  - Cargas horarias por asignatura según cursos.
  - Disponibilidades de especialistas (ej., Religión solo ciertos días/horas).
  - Descansos obligatorios (2h 15 min/semana = 2 sesiones + 1 patio).
  - Coordinaciones (1 sesión libre por coordinador de ciclo/TIC/Erasmus+).

### 3.6 — Generación de horarios

El corazón funcional de FlowSchool. Genera automáticamente horarios semanales respetando todas las restricciones.

- Un usuario puede **iniciar la generación de horarios** seleccionando:
  - **Semana objetivo**: para validar la estructura horaria.
  - **Grupo/curso**: puede generar para un curso específico o para toda la escuela.
- El sistema ejecuta un **algoritmo de generación** que:
  - Crea una matriz semanal (lunes a viernes, sesiones definidas) para cada grupo.
  - Asigna asignaturas respetando cargas horarias.
  - Asigna profesores respetando:
    - Incompatibilidad de duplicidad (no dos sesiones de la misma materia en un día).
    - Ubicación unitaria (no solapamientos de docentes).
    - Especialidades (especialista correcto para cada área).
    - Disponibilidades (ej., Religión no en ciertos horarios).
  - Respeta descansos obligatorios y coordinaciones.
  - Detecta y reporta conflictos irresolubles.
- El usuario ve **resultados en tiempo real**:
  - Tabla con el horario de cada grupo (formato Markdown listo para copiar a Word).
  - Horarios individuales de cada especialista (para auditar solapamientos).
  - Lista de conflictos sin resolver (si los hay).
- El usuario puede **regenerar** si los resultados no son satisfactorios (ej., ajustando restricciones).
- El usuario puede **guardar/validar** un horario como "oficial" para el curso.
- El usuario puede **exportar** horarios en formato Markdown o PDF.

### 3.7 — Gestión del comedor (Calendario y registro de asistencia)

Seguimiento de la asistencia diaria de alumnos al servicio de comedor.

- Un usuario puede **ver un calendario mensual** por curso, que muestra:
  - Todos los días del mes.
  - Para cada día, los alumnos inscritos a comedor en ese curso.
- En el calendario, un usuario puede **registrar asistencia**:
  - Marcar un alumno como "asistió" o "no asistió" para un día específico.
  - Cambiar el estado retroactivamente.
- Un usuario puede **filtrar la vista** del calendario:
  - Por alumno (mostrar solo sus registros mensuales).
  - Por estado de asistencia (mostrar solo los que asistieron o faltaron).
- Un usuario puede **generar un reporte** del mes (opcional en MVP): asistencias totales por alumno.

---

## 4. Requisitos no funcionales

- **Privacidad**: los datos del colegio (estructura, horarios, información de alumnos) se almacenan de forma segura. Solo usuarios autenticados del colegio tienen acceso.
- **Integridad de datos**: las restricciones y cargas horarias nunca se pierden; la generación de horarios es reproducible si se usan las mismas restricciones.
- **Rendimiento**: la generación de horarios para un colegio mediano (30+ grupos) debe completarse en menos de 60 segundos mediante el solver principal (CSP). Si el CSP agota ese tiempo sin solución, se ejecuta un algoritmo de respaldo (Backtracking, hasta 120 segundos) cuyo tiempo queda fuera de este límite.
- **Responsive**: la interfaz funciona en navegadores de escritorio y móvil. Los formularios y tablas son usables en pantallas pequeñas.
- **Errores claros**: cualquier error (validación, conflicto en horarios, restricción incompatible) se muestra al usuario en lenguaje claro, no como un error técnico.
- **Observabilidad**: las operaciones de generación de horarios se registran (logs) para poder diagnosticar fallos y auditar cambios.
- **Accesibilidad**: la interfaz cumple con estándares WCAG 2.1 Nivel AA (colores contrastados, navegación por teclado, etiquetas descriptivas).

---


## 5. Criterios de éxito del MVP

El MVP se considera exitoso si, tras 2-3 semanas con un colegio piloto:

- Un usuario puede completar el flujo entero — registrarse, definir la estructura del colegio (profesores, alumnos, cursos, restricciones), generar un horario coherente y registrar asistencia al comedor — sin ayuda técnica externa.
- La generación de horarios produce un resultado sin conflictos irresolubles para un colegio mediano (30+ grupos, 20+ profesores).
- El 95% de las restricciones pedagógicas y laborales especificadas se respetan en el horario generado.
- La interfaz es usable en navegadores de escritorio (Chrome, Firefox, Safari) sin errores de consola.

---

## 6. Riesgos conocidos

- **Complejidad del algoritmo de horarios es el mayor riesgo técnico del MVP.** La combinación de restricciones pedagógicas, disponibilidades, especialidades y descansos crea un problema NP-hard. El algoritmo puede ser incapaz de encontrar una solución para ciertos conjuntos de restricciones contradictorias. Se recomienda un spike técnico para validar feasibilidad antes de comprometer cronogramas agresivos.
- **Especialistas con restricciones críticas** (e.g., Religión solo lunes, martes y viernes por la mañana) pueden ser cuellos de botella. El algoritmo debe reportar claramente qué restricción causa conflictos irresolubles.
- **Validación de cargas horarias**: algunos cursos pueden exceder o no alcanzar el total de sesiones semanales esperadas debido a la rigidez de la estructura. La validación post-generación debe ser exhaustiva.
- **Exportación y legibilidad**: los horarios deben ser legibles y copiar-pegarbles a Word sin perder formato. Las tablas Markdown deben tener cuidado con caracteres especiales y espacios.

---

## 7. Glosario

- **Profesor/Docente**: empleado del colegio que imparte asignaturas. Puede ser tutor de un curso o especialista.
- **Tutor**: profesor responsable de un grupo/clase específico.
- **Especialista**: profesor que imparte una asignatura específica (e.g., Inglés, E.F.) a varios grupos.
- **Alumno**: estudiante inscrito en un curso.
- **Curso**: nivel educativo (e.g., "1º Primaria"). Cada curso puede tener múltiples clases (A, B, C).
- **Clase/Grupo**: subgrupo de alumnos de un curso (e.g., "1º Primaria A").
- **Asignatura/Área**: materia que se imparte (Matemáticas, Inglés, Música, etc.).
- **Sesión**: bloque de tiempo de 45 minutos.
- **Patio/Descanso**: período de recreo incluido en el horario lectivo, atendido por docente.
- **Restricción**: parámetro que define cómo se deben respetar reglas pedagógicas, laborales o de disponibilidad (e.g., "Inglés 3 sesiones/semana en 1º").
- **Horario**: matriz semanal (lunes-viernes, sesiones) asignando asignaturas y profesores a grupos.
- **Incompatibilidad de duplicidad**: regla que prohíbe dos sesiones de la misma asignatura en un mismo día para un grupo.
- **Ubicación unitaria**: regla que prohíbe un docente en dos aulas simultáneamente.
- **Coherencia Alumnado-Especialista**: alineación exacta entre el horario de un grupo y el del especialista que lo atiende.
- **Solapamiento**: conflicto donde un docente debería estar en dos lugares o un grupo en dos aulas.
- **Colegio piloto**: institución educativa seleccionada para validación del MVP.
- **Comedor**: servicio de comida en el colegio. Alumnos pueden estar inscritos y recibir beca.
- **Asistencia al comedor**: registro diario de si un alumno comió o no en el colegio.
