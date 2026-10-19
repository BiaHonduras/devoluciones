# Control de Devoluciones · BIA Honduras

Web preparada para GitHub Pages. Incluye ingreso, seguimiento, dashboard y detalle con exportación CSV. Repositorio de publicación: BiaHonduras/devoluciones. La instalación en Supabase está pendiente.

## Accesos y conexión

La aplicación importa el cliente y la función de ingreso del archivo público `https://biahonduras.github.io/control-tiempos/supabase-config.js`. Usa la misma cuenta de Supabase Auth, sin copiar contraseñas ni crear usuarios. Cuando la cuenta exige cambio de contraseña, envía al procedimiento existente de Control de Tiempos.

Proyecto identificado: `czxzghhwgfciyrgmgtai`. Los permisos por sede se consultan con la función existente `usuario_puede_sede`. Solo acceden usuarios activos vinculados a Supabase Auth, con su contraseña actualizada y sedes asignadas.

## Cambios de base de datos para revisar y autorizar

`instalar.sql` es el script completo y transaccional. Crea:

- Los catálogos `sedes`, `observaciones`, `estados`, `negocio` y `liquidadoras`, con los datos solicitados.
- Las tablas `devoluciones`, `devoluciones_detalle` y `devoluciones_historial`.
- El esquema interno `devoluciones_privado`, que mantiene el consecutivo y valida las operaciones.
- Funciones para leer catálogos, consultar códigos, guardar, avanzar y reanudar una gestión.
- Permisos de lectura por sede para las nuevas devoluciones. Las escrituras pasan por las funciones validadas. Los usuarios sin sesión no tienen acceso a estas tablas ni funciones.

El script utiliza las tablas existentes `usuarios` y `codigos` para consultar información. No modifica esas tablas ni los accesos del sistema de tiempos. La instalación se detiene y revierte si encuentra tablas de destino ya existentes; debe ejecutarse una sola vez después de revisar posibles conflictos de nombres.

La revisión automática de aprobación bloqueó su ejecución en la base compartida por requerir autorización explícita de esta instalación. No se aplicaron cambios a Supabase durante esta entrega.

## Funcionamiento

1. **Ingreso:** selecciona sede, gestor, cliente y observación. Completa factura y bodegas. Consulta cada código, indica su cantidad y agrégalo a la lista. El costo y descripción se toman de `codigos`. Al guardar se recalculan desde la base, se guardan todos los productos en una sola transacción y se asigna el consecutivo.
2. **Seguimiento:** busca el número completo. Selecciona gestor y liquidadora para tomar la gestión N2. Luego registra nota de débito N3, ingreso en GP N4 y finalización. Cada avance agrega fecha, usuario real que ejecutó la acción y comentario al historial. Los cambios simultáneos se detectan por versión.
3. **Atrasado:** conserva la etapa anterior en el historial y permite reanudarla. Requiere motivo. **Anulado:** requiere motivo y confirmación; cierra la gestión.
4. **Dashboard:** filtros por fechas, sede, estado, gestor, y búsqueda de cliente, código u observación. Muestra gestiones únicas, tiempo N1–N4, resueltas y gestores N1 con actividad. Incluye distribución por sede, estado, observación, gestor, cliente y unidades por código. Los gráficos muestran hasta 8 categorías principales.
5. **Detalle:** una línea por producto, con datos de la gestión, fechas, tiempos, cantidades y costos. Exporta todas las líneas del filtro actual. **El costo de gestión se repite por producto: para sumar el importe del CSV, usa Costo de línea.**

Los tiempos son horas transcurridas, sin descuento de fines de semana o feriados. N1–N4 termina al registrar el ingreso en GP, siguiendo las fechas del Excel. Los promedios solo incluyen gestiones con las dos fechas de la etapa. Las resueltas son las que tienen estado `Finalizado`.

La secuencia es diaria y común a todas las sedes: `DEV-ddmmyyyy-xx`. Usa la fecha de Honduras y continúa con tres o más dígitos cuando supera 99. Se preservaron los máximos diarios encontrados en el Excel: para el 19/10/2026, el último es 06. El guardado admite reintentos sin duplicar una gestión si se pierde la respuesta de red.

## Historial del Excel

El archivo original permanece intacto. **Los registros históricos del Excel no se importaron a la base.** La web mostrará los registros guardados por la nueva aplicación cuando se instale su base. Únicamente se incorporaron los máximos de los consecutivos para continuar su numeración. La migración del historial necesita una revisión separada, porque el Excel contiene códigos, cantidades y costos concatenados por gestión y textos con problemas de codificación.

## Publicación en GitHub Pages

Repositorio: https://github.com/BiaHonduras/devoluciones. Pendiente: autorizar la instalación SQL y comprobar GitHub Pages.

Después de instalar y verificar la base, carga estos cuatro archivos en la misma carpeta del repositorio:

- `index.html`
- `styles.css`
- `app.js`
- `logic.mjs`

Activa GitHub Pages para la rama y carpeta elegidas. La web funciona en la raíz o en una subcarpeta. No requiere compilación. Necesita acceso a Internet al sistema de tiempos y a su CDN de Supabase. No publiques el Excel ni credenciales privadas. Los archivos SQL y de documentación pueden conservarse aparte del sitio publicado.

## Verificaciones realizadas y pendientes

- JavaScript: revisión de sintaxis correcta.
- Lógica: pruebas de límites de fecha en Honduras, filtros combinados, suma de líneas sin duplicar gestiones, promedios con fechas incompletas, estados finales y protección de fórmulas al exportar CSV.
- SQL: 48 sentencias y 5 cuerpos PL/pgSQL analizados correctamente por el analizador PostgreSQL.
- Catálogos: 5 sedes, 25 observaciones, 7 estados, 116 negocios y 2 liquidadoras.
- Pendientes: instalación, ejecución real de las funciones y políticas, pruebas con usuarios de sedes distintas, reintentos/concurrencia en la base, revisión visual en computadora y teléfono, y comprobación de la URL publicada.
- El navegador de vista previa no pudo conectar con el servidor local de esta sesión. No se declara una prueba visual exitosa.

Antes de ponerla en operación, verificar con registros de prueba: guardar dos productos, consultar la gestión, completar las etapas, comprobar el dashboard y CSV, y confirmar que otra sede sin permiso no puede leer ni modificar esa gestión. Eliminar los registros de prueba únicamente mediante un procedimiento autorizado por el administrador.

