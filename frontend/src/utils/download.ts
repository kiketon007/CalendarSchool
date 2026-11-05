import type { ExportedFile } from './scheduleExport';

/**
 * Descarga un documento generado en el navegador: un `Blob`, un enlace `<a download>` temporal que se pulsa y se quita,
 * y la dirección del `Blob` liberada en el siguiente turno (revocarla antes puede cortar la descarga en algunos
 * navegadores). No hace peticiones.
 */
export function downloadFile({ fileName, mimeType, content }: ExportedFile): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}
