# Release v1.2.3

Fecha: 2026-03-31

Resumen:

- Se ha corregido un error que provocaba la generación de archivos duplicados durante el proceso de descarga.
- Mejoras en la captura y escritura de metadatos: más campos soportados y mayor precisión.
- Optimización del pipeline de descarga y post-procesado para reducir uso de CPU y memoria.

Detalles técnicos:

- Fix: Evitar duplicados revisando el flujo de guardado y comprobando existencia previa antes de escribir.
- Meta: Ampliado el conjunto de metadatos escritos (artista, álbum, año, genre, cover art y campos ID3 adicionales cuando estén disponibles).
- Perf: Reducción de operaciones síncronas y mejor manejo de buffers para reducir picos de memoria.

Notas de despliegue:

- Se recomienda reconstruir los artefactos nativos y desplegar las funciones de Supabase si se usan en producción.
