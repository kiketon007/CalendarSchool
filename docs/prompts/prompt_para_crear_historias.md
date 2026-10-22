Actúa como un Business Analyst y Product Owner Agile con amplia experiencia en aplicaciones SaaS. Tu tarea es extraer y redactar las User Stories (Historias de Usuario) para el MVP de "CalendarSchool" basándote estrictamente en el documento PRD_CalendarSchool.md provisto.

Por favor, sigue minuciosamente el contexto, formato, alcance y restricciones que se detallan a continuación:

---

### 1. Contexto de Entrada
Analiza a fondo el documento 'PRD_CalendarSchool.md' adjunto para entender el comportamiento esperado de CalendarSchool MVP.

### 2. Formato de las User Stories
Cada historia de usuario debe redactarse siguiendo de forma estricta la estructura clásica:
"Como [rol], quiero [acción], para [beneficio]."

### 3. Criterios de Aceptación (Gherkin)
Cada historia de usuario debe incluir entre 3 y 5 criterios de aceptación detallados y verificables. 
* Utiliza el formato: Dado que [contexto] / Cuando [acción] / Entonces [resultado].
* Evita generalidades (ej. no pongas "El sistema funciona rápido"). Sé específico con las reglas de negocio del PRD (ej. "Contraseña de al menos 8 caracteres", "Respuesta en menos de 1 segundo").

### 4. Alcance Acotado del MVP
Genera las primeras 20 historias que crees que son necesarias para emperzar con el proyecto. Como por ejemplo:

1. Generar las tablas y releaciones necesarias en nuestra base de datos
2. Registro y autenticación de usuarios en nuestra aplicación. 
3. CRUD completo de profesores. 
4. ...

### 5. Restricciones Explícitas (OUT OF SCOPE)
Si el PRD no menciona un detalle o si pertenece a la siguiente lista, NO debes crear historias para ello, ni proponerlo como solución:
* NO inventes funcionalidades cosméticas o extras que no estén explícitas.
* NO propongas arquitectura técnica, stack de base de datos ni subtareas de desarrollo.
* NO asumas una app móvil nativa (la interfaz es únicamente web responsive).
* NO crees gestión de etiquetas, proyectos o subtareas (jerarquías).


### 6. Gestión de Supuestos ([Asumido])
Como el equipo de desarrollo necesita total claridad sobre lo que es literal y lo que es interpretación:
* Si necesitas inferir o asumir algún comportamiento lógico de UX/UI o negocio que NO esté explícito en el PRD para que la historia tenga sentido, debes añadir obligatoriamente el tag '[Asumido]' al final del criterio o de la historia correspondiente. Si es literal, no pongas nada.

### 7. Agrupación y Salida
Agrupa las historias de usuario de forma limpia utilizando casos de usuario o módulos funcionales según la lógica del PRD.

---


## Módulo: [Nombre del Módulo/Épica]

### US0X: [Título corto de la historia]
**Historia:** Como [rol], quiero [acción], para [beneficio].

**Criterios de Aceptación:**
* **CA1:** Dado que [contexto]... Cuando [acción]... Entonces [resultado].
* **CA2:** Dado que [contexto]... Cuando [acción]... Entonces [resultado]. [Asumido: Detalle de UX inferido].
* **CA3:** Dado que [contexto]... Cuando [acción]... Entonces [resultado].