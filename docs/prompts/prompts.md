## Índice

1. [Descripción general del producto](#1-descripción-general-del-producto)
2. [Arquitectura del sistema](#2-arquitectura-del-sistema)
3. [Modelo de datos](#3-modelo-de-datos)
4. [Especificación de la API](#4-especificación-de-la-api)
5. [Historias de usuario](#5-historias-de-usuario)
6. [Tickets de trabajo](#6-tickets-de-trabajo)
7. [Pull requests](#7-pull-requests)

---

## 1. Descripción general del producto

**Prompt 1:**

Actúa como un Senior Product Manager experto en la definición de productos digitales y metodologías ágiles. 

Tu objetivo es redactar un PRD (Product Requirements Document) exhaustivo, profesional y listo para producción, tomando como única base la definición de producto que se encuentra en el archivo `Horarios.docx`.

Para que el documento sea coherente y cumpla con el estándar esperado, **debes seguir estrictamente la siguiente estructura y formato de secciones**:

``` 
> **Producto**: [Nombre del producto infundido o definido en el texto]
> **Versión del documento**: 1.0 · [Mes y año actual]
> **Estado**: aprobado para MVP
> **Owner de producto**: equipo de producto
> **Audiencia de este documento**: equipo de ingeniería (backend, frontend), QA, y cualquier agente de IA que vaya a decomponer este PRD en backlog.

---

## 1. Resumen ejecutivo

[Breve descripción de qué es el producto, su propósito principal y propuesta de valor única en base a la definición básica].

**Funcionalidades principales:**
- [Funcionalidad clave 1]
- [Funcionalidad clave 2]

### Qué incluye el MVP

**[Módulo o Bloque de Autenticación / Acceso / Seguridad]:**
- [Detalles de registro, roles, sesiones, permisos, etc., aplicados al producto].

**[Módulo o Bloque de Gestión de Datos Maestros / Núcleo]:**
- [CRUDs, entidades principales y sus atributos].

**[Módulos Funcionales Específicos del Producto]:**
- [Desglose detallado de las características principales que incluye la primera versión].

### Qué NO incluye el MVP (out of scope explícito)

- Funcionalidades no listadas explícitamente en este documento.
- [Exclusiones específicas o características dejadas para fases futuras del producto].

---

## 2. Usuario objetivo

**Perfil primario**: [Descripción del rol de usuario principal, sector o contexto de uso].

**Responsabilidades principales:**
- [Tarea clave 1 del usuario].
- [Tarea clave 2 del usuario].

**Contexto:**
- [Contexto operativo, dolores actuales que sufre el usuario, herramientas previas o motivaciones].

---

## 3. Requisitos funcionales

### 3.1 — [Nombre del primer gran bloque funcional, ej. Autenticación y gestión de cuenta]
- [Regla de negocio o comportamiento detallado paso a paso].
- [Gestión de roles, permisos o estados].

### 3.2 — [Nombre de la entidad 1, ej. Gestión de Profesores / Usuarios / Elementos (CRUD)]
- [Qué puede crear el usuario y qué campos obligatorios/opcionales tiene].
- [Listado, edición, borrado y filtros disponibles].

### 3.3 — [Nombre de la entidad 2 o módulo operativo]
- [Detalles funcionales específicos].

### 3.4 — [Continuar con los subapartados numéricos necesarios según el alcance del producto (3.4, 3.5, etc.)]

---

## 4. Requisitos no funcionales

- **Privacidad y Seguridad**: [Cómo se protegen y aíslan los datos de los usuarios/organizaciones].
- **Integridad de datos**: [Consistencia y reproducibilidad de los procesos].
- **Rendimiento**: [Tiempos de respuesta esperados para operaciones pesadas o cargas estándar].
- **Responsive / Multiplataforma**: [Comportamiento en escritorio y dispositivos móviles].
- **Manejo de errores**: [Claridad en los mensajes de error mostrados al usuario].
- **Observabilidad**: [Trazabilidad o registros de operaciones críticas].
- **Accesibilidad**: [Estándares de accesibilidad requeridos, ej. WCAG].

---

## 5. Criterios de éxito del MVP

El MVP se considera exitoso si, tras las primeras semanas de pruebas piloto:
- [Criterio de adopción o autonomía del usuario].
- [Criterio técnico de rendimiento o precisión].
- [Criterio de usabilidad o ausencia de errores críticos].

---

## 6. Riesgos conocidos

- **[Riesgo técnico principal]**: [Descripción del reto de arquitectura o complejidad algorítmica/lógica y cómo se mitiga].
- **[Riesgo de adopción o negocio]**: [Puntos críticos que podrían generar cuellos de botella].

---

## 7. Glosario

- **[Término clave 1]**: [Definición clara adaptada al dominio del producto].
- **[Término clave 2]**: [Definición clara].
- [Incluir todos los términos técnicos, roles o conceptos propios del dominio que aparezcan en el producto].

```
---

## 2. Arquitectura del Sistema

### **2.1. Diagrama de arquitectura:**

**Prompt 1:**
Me he basado en el hardness del proyecto de Specboot de LIDR personalizando algunos de los ficheros en base a mis conocimientos. Con el fin de sentirme más cómodo con la arquitectura de la aplicacion y sus herramientas. Básicamente he modificado los ficheros:
* CLAUDE.md
* docs/base-standards-castellano.md
* docs/base-project.md
* docs/backend-standards.md
* docs/frontend-standards.md

A partir de esta estrutura y trabajando en base al flujo de openSpec y las mejoras introducidas en el proyecto de Specboot de LIDR he ido generando el resto de puntos

Flujo: /openspec-explore USXX --> /enrich-us USXX --> /opsx:propose USXX --> /opsx:apply USXX --> /apply USXX --> /verify USXX --> /archive USXX --> /commit USXX

### **2.2. Descripción de componentes principales:**

### **2.3. Descripción de alto nivel del proyecto y estructura de ficheros**

### **2.4. Infraestructura y despliegue**

### **2.5. Seguridad**

### **2.6. Tests**

---

### 3. Modelo de Datos

**Prompt 1:**
Misma configuración y trabajo que el indicado en el prompt del punto 2.1

---

### 4. Especificación de la API

**Prompt 1:**
Misma configuración y trabajo que el indicado en el prompt del punto 2.1

---

### 5. Historias de Usuario

**Prompt 1:**
prompt_para_crear_historias.md

**Prompt 2:**
prompt_poke-holes.md

---

### 6. Tickets de Trabajo

**Prompt 1:**
Misma configuración y trabajo que el indicado en el prompt del punto 2.1

---

### 7. Pull Requests

**Prompt 1:**
Misma configuración y trabajo que el indicado en el prompt del punto 2.1
