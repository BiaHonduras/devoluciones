# Control de Devoluciones · BIA Honduras

Sitio: https://biahonduras.github.io/devoluciones/index.html

Web estática de GitHub Pages con ingreso, seguimiento N1–N4, dashboard, detalle, usuarios e intercambio CSV. Usa el cliente Supabase y el acceso corporativo existentes de Control de Tiempos.

## Actualización del 20 de octubre de 2026

Las tablas y funciones están instaladas en la base activa.

- Sedes: se mantiene `usuario_puede_sede`, respaldada por las asignaciones activas de `usuarios_sedes`. Cuando hay una sola sede autorizada queda seleccionada automáticamente.
- Usuarios: módulo visible para la cuenta maestra y superadministradores autorizados por `dev_puede_admin_usuarios`. Usa la función existente `devoluciones-usuarios`, que invita por correo, vincula `usuarios.auth_user_id` y asigna la sede en `usuarios_sedes`. Crea acceso operativo; exige configurar contraseña mediante el flujo corporativo existente. No almacena contraseñas en el navegador.
- Importar | Exportar: plantilla y exportación estándar con los mismos encabezados técnicos; correos para gestores, códigos para sedes, fechas ISO con zona horaria, cantidades/costos decimales. Una fila por producto; campos de gestión repetidos e idénticos. Exporta los registros del filtro de Dashboard/Detalle. La exportación de reporte en Detalle sigue disponible.
- Importación restringida a superadministradores: validación local, confirmación y RPC transaccional `dev_importar_historico`. Rechaza gestiones ya existentes y no sobrescribe históricos. Máximo 10,000 filas, 200 SKU por gestión y 15 MB en el navegador. Las validaciones de catálogos, códigos y permisos vuelven a ejecutarse en la base.
- `database/actualizar_modulos.sql` corrige validación de correo/decimales y actualiza los máximos de los consecutivos diarios al importar. Aplicado a Supabase; no se requiere volver a ejecutar `instalar.sql`.
- Favicon: se referencia `favicon.png`. `index.htm` redirige a `index.html`, conservando parámetros y sección.

Verificación: `node --check app.js`, `node --test tests/transfer.test.mjs`, migración aplicada y consulta SQL de validadores/permisos/consecutivos. No se enviaron invitaciones ni se importaron registros de producción durante estas comprobaciones. La creación real y la importación desde una sesión administrativa quedan pendientes de prueba operativa.

## Clientes, comentarios y logo

En Ingresar devolución, Agregar Cliente guarda en `negocio`; Agregar Comentario guarda una opción en `observaciones`. El formulario permite hasta 200 caracteres y selecciona el valor guardado sin limpiar la devolución. Los usuarios activos con contraseña actualizada y acceso a alguna sede pueden agregar opciones. La función valida estos permisos en la base, normaliza espacios y reutiliza coincidencias sin distinguir mayúsculas. No concede escritura directa sobre las tablas.

Se utiliza el logo corporativo de `https://biahonduras.github.io/contenedores/brand/bia-honduras-logo.png` en el acceso y menú lateral. La disponibilidad de esta imagen depende del sitio de Contenedores.

Migración `database/agregar_catalogos.sql` aplicada. Prueba transaccional con rollback: guardado en ambas tablas, reutilización de duplicados y rechazo sin sesión correctos. Sintaxis JavaScript, referencias HTML y pruebas CSV correctas.

## Seguimiento y control de entrega · 21 de octubre de 2026

- `Tomar gestión N2` asigna gestor y liquidadora, cambia a Enviado a Liquidación y agrega la devolución a un control persistente. Responder Sí permite buscar otra gestión; No abre el documento para editarlo e imprimirlo. Cada control agrupa únicamente la misma sede, gestor N2 y liquidadora. El contador Facturas cuenta devoluciones, independientemente de sus SKU.
- En Seguimiento, Controles de entrega permite continuar controles abiertos, consultar, editar e imprimir nuevamente. El botón Ver control de entrega también permite preparar el documento de gestiones antiguas con datos N2 completos, sin volver a avanzar su estado.
- Gestiones N3–N4 solicita confirmar las notas de débito y luego permite finalizar el ingreso a bodega. Los estados terminales deshabilitan ambos botones. El historial conserva los movimientos.
- El documento imprime en carta horizontal, con membrete del formato proporcionado, todos los SKU como Código - Descripción, LIQ inicialmente vacío y firmas de Créditos y Cobros. Los datos extensos continúan en páginas numeradas. Editar documento modifica su copia guardada; para corregir el registro original se utiliza Editar devolución en Detalle.
- `public.liquidadoras.celular` guarda el teléfono de contacto. Completar manualmente en Supabase → Table Editor → liquidadoras → celular. El documento consulta ese valor y permite una corrección particular para la entrega.
- Migración: `database/control_entrega.sql`. Tablas `devoluciones_entregas` y `devoluciones_entrega_items`, lectura con RLS por sede y escritura mediante RPC con validación de rol admin/operador o maestro y versión. No hay escritura anónima ni acceso entre sedes no autorizadas.
- Verificado con pruebas SQL aisladas, 32 pruebas automatizadas y navegador con datos sintéticos: N2, edición/impresión, confirmaciones N3, finalización y cierre tras imprimir. PDF de prueba carta horizontal; 100 SKU completos repartidos en cuatro páginas.
