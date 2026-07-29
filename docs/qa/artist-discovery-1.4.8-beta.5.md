# QA — descubrimiento de artistas 1.4.8-beta.5

Alcance: Desktop + Android.

## Automatizado

- La colección contiene más de 300 artistas únicos y al menos 16 géneros.
- La primera tanda contiene 12 artistas únicos de 12 géneros distintos.
- Una nueva tanda excluye los artistas descargados y los 12 mostrados antes.
- Las 12 tarjetas visibles reciben colores principales y secundarios distintos.
- La asignación de paleta es determinista para una misma tanda.

## Validación ejecutada

- ESLint y TypeScript: correctos.
- Vitest: 220 pruebas correctas.
- pytest Desktop: 41 pruebas correctas.
- Build Vite y sincronización Capacitor: correctos.
- Tests Android y compilación Release firmada: correctos.
- Smoke test y empaquetado del ZIP portable: correctos.
- Contrato Android: package, versión, firma, APK y manifiesto correctos.
- QA visual responsive en 390 × 844 y 1440 × 900.
- Rotación de artistas comprobada sin errores de consola de la aplicación.

## QA manual pendiente

- Instalación manual en un Android físico y Windows 10/11.
