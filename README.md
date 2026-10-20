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
