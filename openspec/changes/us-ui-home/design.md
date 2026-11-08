## Context

`/onboarding` (`pages/OnboardingPage.tsx`) se escribió en US04, cuando no existía ninguna sección. Hoy tiene:
- un `Container as="main" className="py-5"` y el `h1` «Te damos la bienvenida, {nombre}», con la línea «Tu colegio {colegio} ya está registrado.»;
- una lista `FEATURES` con dos funcionalidades sin ruta (`schedules` y `canteen`) que `components/FeatureCard` pinta como `Card as="article"` con «Próximamente»;
- solo para `ADMIN`, la sección «Administración» con un `FeatureCard` enlace a `/usuarios`.

`FeatureCard` decide por `to?`: con ruta es un `Card as={Link}` y sin ruta un `article` no interactivo.

US-UI-THEME dejó el tema en Sass (`styles/theme.scss`, con `.cs-card`, `.cs-eyebrow` y `.cs-tone-{lavender|peach|mint|yellow}`) y `theme.test.ts`, que compila el SCSS y comprueba contrastes (`testSupport/contrast.ts`). US-UI-SHELL dejó la barra lateral en `components/AppShell.tsx`, con la constante `WORKSPACE_LINKS` (privada de `AppShell` al empezar este cambio) (`to`, `labelKey`, `Icon`, `end?`): Inicio, Cursos, Profesores, Alumnos, Calendarios, Asignaturas, Reglas y Horarios.

La maqueta (`app/page.tsx`) aporta el banner en color primario con círculos decorativos, la fecha, el saludo, el colegio en negrita y una cuadrícula de 4 columnas con tarjetas enlace (icono con tono, flecha, título y descripción). Es un cambio solo de frontend y de presentación: sin backend, contrato, modelo de datos ni CSP. Por tanto, no afecta a la generación ni a la seguridad: la autenticación, los permisos por rol y el aislamiento por colegio no cambian, y la tarjeta «Usuarios» sigue siendo una comodidad (deciden `RequireRole` y el backend).

## Goals / Non-Goals

**Goals:**
- Banner con la fecha real, el saludo y el colegio, AA y sin estilos en línea.
- Siete tarjetas enlace que no puedan desincronizarse de la barra lateral.
- `FeatureCard` más simple, siempre enlace.
- `axe` limpio, sin desplazamiento horizontal a 360 y 1280 px, respeto a `prefers-reduced-motion` y el CSS bajo 33,75 kB en gzip.

**Non-Goals:**
- Cifras del colegio, «¿Necesitas ayuda?», «Ver todos los módulos», el estado «Disponible» y el buscador.
- Saludo según la hora y fecha que se actualiza a medianoche.
- Cambios en la barra lateral más allá de exportar su lista; el resto de pantallas (US-UI-REST).

## Decisions

### D1. Banner
Marcado: `section.cs-home-banner` con `aria-labelledby="onboarding-title"`, de modo que es una región nombrada por el saludo. Contiene:
- `p.cs-home-date` con un punto decorativo (`::before`) y el `time`;
- el `h1#onboarding-title`;
- `p.cs-home-message` con `Trans`.

El texto es blanco sobre `$brand` (5,37:1), y los círculos de la maqueta son `::before`/`::after` de la sección, con `overflow: hidden` y `position: relative`. Sin el «✦» (no aporta y como texto lo leería un lector de pantalla). El `h1` no recibe `tabIndex` ni ref: ninguna acción de la portada devuelve el foco a él.
- **Alternativa descartada:** `PageHeader` dentro del banner. Su sobretítulo y su descripción no encajan (la fecha no es un sobretítulo) y el banner no lleva acciones.
- **Alternativa descartada:** el lavanda claro de la maqueta (`#e0e7ff`) para la fecha y el mensaje: da 4,36:1 sobre el primario y no llega a AA.

### D2. Fecha
La fecha la da una función pura, `utils/longDate.ts`, con `longDate(date, locale)`, que devuelve `{ label, iso }`:
- `label` es `new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(date)` con la primera letra en mayúscula según el idioma (`toLocaleUpperCase(locale)`);
- `iso` es `AAAA-MM-DD` construido con `getFullYear`/`getMonth`/`getDate`, es decir, con la fecha local. `toISOString()` daría el día UTC, que entre las 0:00 y la 1:00 o las 2:00 en España es el anterior.

`OnboardingPage` la calcula una vez por montaje (`useState(() => new Date())`) con `i18n.language`.
- **Por qué en JS y no con `::first-letter`:** el texto del DOM es el que leen los tests, el lector de pantalla y el E2E, y la ficha pedía la mayúscula visible. Un pseudoelemento dejaría el texto en minúscula para todos salvo para la vista. Se actualiza la línea de la ficha que proponía el CSS.
- **Tests:** `vi.useFakeTimers({ toFake: ['Date'] })` con `vi.setSystemTime` (solo `Date`, para no congelar los `findBy` de Testing Library), y la función con tablas en `es` y `en`, incluido un instante cercano a medianoche.

### D3. Las secciones y su única fuente
`NavItem`, `WORKSPACE_LINKS` y `ADMIN_LINKS` pasan de `AppShell` a `components/navigation.ts` (un fichero de componente no puede exportar constantes: `react-refresh/only-export-components`), y `AppShell` los importa sin cambiar nada más. `OnboardingPage` declara su propia lista `SECTIONS` (`key`, `to`, `Icon`, `tone`) en el orden de la portada (Horarios primero), porque el orden y los tonos son de la portada y no de la barra. Dos tests la atan a la barra:
- el conjunto de `to` de `SECTIONS` es el de `WORKSPACE_LINKS` sin `/onboarding`;
- para cada sección, el texto de `onboarding.features.<key>.name` es igual al de su `labelKey` en la barra, y el `Icon` es el mismo componente.

Los tonos rotan lavanda, melocotón, menta y amarillo en el orden de la lista, y la tarjeta «Usuarios» toma el siguiente de la rotación.
- **Alternativa descartada:** derivar las tarjetas de `WORKSPACE_LINKS` (filtrando Inicio y reordenando). Mezcla en la barra datos de la portada (tono, descripción, orden) o esconde un reordenamiento en código. Con dos listas y dos tests, una sección nueva en la barra rompe el test de la portada hasta que tenga su tarjeta.
- **Alternativa descartada:** reutilizar `header.*` como nombre de la tarjeta. Las claves de la barra son etiquetas de navegación y las de la portada van con su descripción; el test de igualdad cubre que no diverjan.

### D4. `FeatureCard`
- **Props:** `textKey`, `icon` (`ReactNode` `aria-hidden`), `to: string` (obligatoria) y `tone: Tone`. `Tone` (`'lavender' | 'peach' | 'mint' | 'yellow'`) se exporta desde el componente.
- **Marcado:** `Link` con la clase `cs-feature-card` y `h-100`, sin `Card` de react-bootstrap. Dentro:
  - una cabecera `d-flex justify-content-between align-items-start` con el icono en `span.cs-feature-icon.cs-tone-<tone>` y `ArrowRightIcon` (`cs-feature-arrow`);
  - el `h3` (`h6`, con el tamaño de la maqueta) con su nombre;
  - un `p` con la descripción (`text-body-secondary`, AA ya comprobado por el tema).
- **Se elimina:** la rama `article`, la `Badge` «Próximamente» y `useId`, porque el `article` ya no existe.
- **Por qué sin `Card`:** `Card as={Link}` pone `.card` sobre un enlace y obliga a anular el color y el subrayado del enlace. Una clase propia controla el borde, el radio (`$border-radius-lg`), el foco y los estados.

### D5. Estilos (`styles/_home.scss`)
Se importa desde `theme.scss` después de `_lists.scss`.
- **`.cs-home-banner`:** fondo `$brand`, color `#fff`, radio `1.75rem`, relleno `2rem`/`2.5rem` según `sm`, y los dos círculos con `border` translúcido en `::before`/`::after`. `.cs-home-message strong` va en blanco con peso 700.
- **`.cs-feature-card`:**
  - borde `$line`, fondo blanco, radio, relleno `1.25rem`, `color: $text` y sin subrayado;
  - `:hover` cambia el borde a lavanda;
  - `:focus-visible` lleva el anillo del tema (`$focus-ring-*` de Bootstrap);
  - la elevación (`transform: translateY(-.25rem)` y sombra) y el desplazamiento de la flecha van **solo** en `@media (prefers-reduced-motion: no-preference)`, junto con su `transition`.
- **`theme.test.ts`:** comprueba el contraste blanco sobre `$brand` en `.cs-home-banner` y que ninguna `transition` de `.cs-feature-card` existe fuera de ese `@media`. Se anota el gzip del CSS antes y después.

### D6. Cuadrícula y contenedor
- **Contenedor:** `Container as="main" fluid="xxl" className="py-4 py-lg-5 px-3 px-lg-4"`, como los listados.
- **Cabecera de las secciones:** debajo del banner, `p.cs-eyebrow` «Tu colegio» y el `h2` «¿Qué quieres gestionar hoy?» (`h4`), con `mt-5`.
- **Cuadrícula:** `Row xs={1} sm={2} xl={4} className="g-3"` para las secciones y la misma para «Administración».
- **Por qué `xl` y no `lg`:** a 992–1199 px la barra lateral ocupa 254 px y cuatro tarjetas quedarían en unos 170 px. A 1280 px quedan unos 1000 px útiles y cuatro tarjetas de unos 240 px.

### D7. Textos
| Clave | es | en |
|---|---|---|
| `onboarding.title` | Hola, {{name}} | Hello, {{name}} |
| `onboarding.message` | Aquí tienes todo lo de `<strong>`{{school}}`</strong>`. | Here is everything for `<strong>`{{school}}`</strong>`. |
| `onboarding.features.eyebrow` | Tu colegio | Your school |
| `onboarding.features.title` | ¿Qué quieres gestionar hoy? | What do you want to manage today? |
| `…schedules.name` / `.description` | Horarios / Comprueba, genera y confirma los horarios del colegio. | Timetables / Check, generate and confirm your school's timetables. |
| `…courses` | Cursos / Cursos, clases y tutores de cada etapa. | Courses / Courses, classes and tutors for each stage. |
| `…professors` | Profesores / El equipo docente, su disponibilidad y su carga lectiva. | Professors / Your teaching staff, their availability and teaching load. |
| `…students` | Alumnos / El alumnado de cada clase. | Students / The students in each class. |
| `…calendars` | Calendarios / Días lectivos y franjas horarias de cada curso. | Calendars / School days and time slots for each course. |
| `…subjects` | Asignaturas / Las materias, su modalidad y los cursos en que se imparten. | Subjects / Subjects, their type and the courses they are taught in. |
| `…constraints` | Reglas / Cómo se reparten las sesiones y sus avisos. | Rules / How sessions are distributed, with their warnings. |

Se eliminan `onboarding.features.canteen.*` y `onboarding.comingSoon`, y se conserva `onboarding.admin.*`. Los nombres en inglés deben coincidir con `header.*` en `en.json` (el test de D3 se ejecuta con el idioma activo, castellano; para el inglés, se comprueba a mano en la tarea de textos). `Trans` sigue el uso de `RegisterPage`: `components={{ strong: <strong /> }}` y `values={{ school }}`, y el colegio se inserta como texto, con un test de un colegio con `<i>`.

### D8. Iconos
`components/icons/ArrowRightIcon.tsx` es nuevo, copiado de Lucide (ISC, ya atribuido en `LUCIDE-LICENSE.txt`), con `IconProps` como el resto. Se eliminan `CutleryIcon`, `CalendarIcon` y `UsersIcon` tras confirmar con `grep` que solo los usan `OnboardingPage` y el test de `FeatureCard`. «Usuarios» usa `UserCogIcon`, el de la barra.

## Risks / Trade-offs

- [**`Trans` y el escapado:** un colegio con marcas podría interpretarse como HTML] → Se usa `values` (React inserta texto) y el test de «marcas o apóstrofos» se conserva sobre el banner.
- [**Fecha local y UTC:** un `dateTime` hecho con `toISOString()` daría el día anterior de madrugada] → `iso` con los componentes locales y un caso de test cerca de medianoche.
- [**Fake timers y Testing Library:** congelar todos los temporizadores bloquea `findBy`] → `toFake: ['Date']` y restaurar en `afterEach`.
- [**Siete tarjetas con el mismo nombre que la barra:** `getByRole('link', { name: 'Cursos' })` encuentra dos] → los tests de la página no montan `AppShell`; en `App.test.tsx` y en Cypress se busca dentro de `main` (`cy.contains('main a', …)`), como ya hace el E2E con «Usuarios».
- [**Pruebas de otras historias que buscan «Gestión de horarios» como `article`:** `App.test.tsx` y `courses.cy.ts`] → pasan a comprobar el enlace a `/horarios`, con la misma intención (el estado de esa tarjeta).
- [**Cuadrícula de 7:** la segunda fila tiene tres tarjetas y un hueco a 1280 px] → Se acepta. Es lo que hace la maqueta con un número que no es múltiplo de cuatro, y estirar la última fila rompería la rejilla.
- [**CSS:** dos componentes nuevos] → Se mide y se anota el gzip; el límite es 33,75 kB.

## Migration Plan

Despliegue normal del frontend por CD tras integrar la PR. No hay datos ni contrato que migrar, y la vuelta atrás es revertir la PR.

## Open Questions

Ninguna.
