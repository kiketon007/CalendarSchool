// CloudFront Function (viewer request, runtime cloudfront-js-2.0) del comportamiento por defecto.
// Las rutas de la SPA (/registro, /onboarding...) no existen como ficheros en S3: se sirven con
// /index.html cuando el último segmento de la ruta no tiene extensión. Los ficheros con extensión
// (assets, favicon...) se piden tal cual. No se usan los errores personalizados de CloudFront
// porque también afectarían a los 404 de /api/* (design.md D8).
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var lastSegment = uri.substring(uri.lastIndexOf('/') + 1);

  if (uri.indexOf('/api/') !== 0 && lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html';
  }
  return request;
}
