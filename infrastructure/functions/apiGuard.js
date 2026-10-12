// CloudFront Function (viewer request, runtime cloudfront-js-2.0) del comportamiento /api/*.
// Mientras el registro está cerrado (hasta el cambio `publicacion-registro`), responde 404
// NOT_FOUND, en el formato común de la API, a todo lo que cuelga de /api/auth sin llegar al
// backend. Abrirlo es quitar la condición. La ruta se normaliza antes de comparar porque Express
// no distingue mayúsculas y minúsculas: /api/Auth/register llegaría al mismo handler.
function handler(event) {
  var request = event.request;
  var path = request.uri;

  try {
    path = decodeURIComponent(path);
  } catch (error) {
    // Una codificación inválida no puede formar un /api/auth válido: se deja pasar y Express la rechaza.
  }
  path = path.toLowerCase().replace(/\/+/g, '/');

  if (path === '/api/auth' || path.indexOf('/api/auth/') === 0) {
    return {
      statusCode: 404,
      statusDescription: 'Not Found',
      headers: { 'content-type': { value: 'application/json' } },
      body: JSON.stringify({
        success: false,
        error: { code: 'NOT_FOUND', message: 'La ruta solicitada no existe' },
      }),
    };
  }
  return request;
}
