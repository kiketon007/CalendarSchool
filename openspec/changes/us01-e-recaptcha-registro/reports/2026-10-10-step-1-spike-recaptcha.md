# Step 1 Report - Spike de la API de reCAPTCHA

- Date: 2026-10-10
- Change: us01-e-recaptcha-registro
- Agent: Claude (Sonnet 5.5)

## Estado
**Prueba con claves reales: pendiente.** No hay claves de reCAPTCHA creadas en Google Cloud (se preguntó al responsable antes de empezar y respondió que aún no las tiene). Se continúa con los verificadores real y falso construidos según la documentación y con respuestas simuladas, y la prueba real pasa a la tarea 11.4. Es requisito antes de publicar el registro en producción.

## Lo que sí se ha podido establecer
Según la documentación oficial de Google (https://developers.google.com/recaptcha/docs/v3 y https://docs.cloud.google.com/recaptcha/docs/verify), el endpoint `POST https://www.google.com/recaptcha/api/siteverify` recibe `secret` y `response` (formulario) y devuelve JSON:

| Campo | Significado |
|---|---|
| `success` | si el token es válido para el sitio |
| `score` | solo en claves de score (v3): de 0,0 (probablemente un bot) a 1,0 |
| `action` | nombre de la acción con la que se obtuvo el token (v3), que debe comprobarse |
| `challenge_ts` | instante de carga del reto, en formato ISO |
| `hostname` | dominio donde se resolvió el reto |
| `error-codes` | opcional: `missing-input-secret`, `invalid-input-secret`, `missing-input-response`, `invalid-input-response`, `bad-request`, `timeout-or-duplicate` |

Un token solo sirve una vez y caduca a los 2 minutos (de ahí `timeout-or-duplicate`). Los tests del adaptador usan respuestas con esta forma.

## Hechos externos que condicionan el cambio
- Google ya no permite crear claves de reCAPTCHA «clásico» (desde el tercer trimestre de 2024): las claves nuevas se crean en un proyecto de Google Cloud, y las clásicas se han migrado allí entre finales de 2025 y principios de 2026. Es gratuito hasta 10.000 evaluaciones al mes.
- **No está confirmado** si una clave creada directamente en Google Cloud admite el endpoint `siteverify` o exige la API de evaluaciones de Google Cloud (`projects.assessments.create`, con otra autenticación). Es la pregunta que la prueba de la tarea 11.4 debe responder.
- Si exige la API de evaluaciones, solo cambia `RecaptchaCaptchaVerifier`: el puerto, el caso de uso, los verificadores falsos, el cliente y el contrato no se tocan (D1 del diseño).

## Qué falta para cerrar el spike
1. Crear dos claves en Google Cloud: una basada en score (v3) y otra de checkbox (v2), con `localhost` entre los dominios permitidos.
2. Guardarlas en ficheros ignorados por git (`backend/.env` y `frontend/.env.local`), sin pegarlas en el chat.
3. Ejecutar la tarea 11.4.
