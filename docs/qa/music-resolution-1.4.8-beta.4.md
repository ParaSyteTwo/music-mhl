# QA — resolución y limpieza 1.4.8-beta.4

Alcance: Desktop + Android.

## Automatizado

- La primera Song de YouTube Music queda verificada aunque el título esté localizado o falten artista y duración.
- Una variante incompatible nunca hereda el estado principal por ocupar la primera posición.
- Candidatos equivalentes se colapsan y las ediciones explícita/limpia conocidas permanecen separadas.
- THE FIRST TAKE se reconoce como versión distinta.
- La resolución automática, el clic normal y el selector inicial usan búsqueda ligera.
- `Buscar más opciones` conserva el camino de verificación profunda.
- Desktop y Android ya no tienen consumidores de las APIs nativas retiradas.

## Validación ejecutada

- ESLint y TypeScript: correctos.
- Vitest: 216 pruebas correctas.
- pytest Desktop: 41 pruebas correctas.
- Build Vite y sincronización Capacitor: correctos.
- Tests Android y compilación Release firmada: correctos.
- Smoke test y empaquetado del ZIP portable: correctos.
- Contrato Android: package, versión, firma, APK y manifiesto correctos.

## QA manual pendiente

- Probar un título localizado japonés como `Where Our Blue Is`.
- Confirmar que dos resultados iguales no aparecen duplicados.
- Confirmar que THE FIRST TAKE y una acústica siguen abriendo el selector.
- Instalar el APK en un Android físico y actualizar desde `1.4.8-beta.3`.
