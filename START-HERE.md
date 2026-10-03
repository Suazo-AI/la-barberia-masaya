# La Barbería Masaya

Piloto website-only. Leer [AGENTS.md](AGENTS.md).
Repo canónico público: https://github.com/Suazo-AI/la-barberia-masaya.
Estado documental revisado: 2026-10-03.

## Fuentes y estado

| Fuente | Estado |
|---|---|
| `main`, base `e74e58622c715b1618c543496b5b680d1bd875f6` | Observado el 2026-10-03: solo README; sin aplicación, manifests, tests ni workflows CI. Reinspeccionar antes de comenzar código. |
| [AGENTS.md](AGENTS.md) | Reglas específicas del piloto, límites comerciales, visuales y de publicación. |
| Paquete de spec del orquestador en cloud | Registrado en el encargo; no transferido ni inspeccionado en esta PC. Ruta y revisión pendientes de reconciliación. |
| `hero03`, fotos reales y mockup actualizado | Decisiones registradas por el usuario; assets y mockup no inspeccionados en esta tarea documental. Aprobación visual final pendiente. |

Este índice no reemplaza la spec canónica ni crea otra spec.
No hay comando de install/build/preview/test de aplicación verificado en esta base.
La documentación no demuestra que exista un website funcionando ni CI configurada.
No se han ejecutado tests de aplicación o revisión visual en esta tarea.

## Decisiones y siguiente trabajo

| ID | Decisión / tarea | Dueño | Dependencia / estado |
|---|---|---|---|
| B-D01 | Solo website del negocio confirmado en Masaya. CRM y bot Forja fuera del alcance actual. | Jason | Instrucción vigente. |
| B-D02 | Hero cinematográfico `hero03`, mejorado con fotos reales. | Jason | Registrado; mockup actualizado entregado según el encargo. |
| B-T01 | Reconciliar estas instrucciones con el paquete de spec cloud, incluyendo ruta y revisión exactas. | Orquestador padre | Pendiente; conservar trabajo cloud existente. |
| B-T02 | Incorporar referencias globales, selección de fotos reales y revisión visual en la dirección de diseño. | Orquestador / Jason | B-T01; aprobación visual humana pendiente. |
| B-T03 | Preparar tareas pequeñas de implementación con evidencia por requisito. | Orquestador | B-T01 y B-T02 aceptadas; nuevas pantallas detenidas hasta incorporar dirección. |
| B-T04 | Definir y ejecutar checks deterministas adecuados al stack realmente elegido. | Implementador / revisor independiente | B-T03; no instalar ni inventar checks ahora. |

La ubicación recibida es junto a Cailagua, `Pali4cuadrasoeste`; el teléfono confirmado es `+50585482197`.
Los servicios, precios, horarios, WhatsApp, reservas y la ubicación geocodificada siguen sin confirmar.
No hay autorización de contacto al negocio, merge o deploy en esta tarea.

## Sincronización

El orquestador padre debe revisar el diff de esta rama documental e incorporar los dos archivos conservando cualquier cambio cloud concurrente.
Comparar primero contra instrucciones y spec ya existentes. No reemplazar carpetas ni copiar notas privadas.
Compartir ruta/revisión de spec y decisiones visuales aceptadas; las imágenes no son requisito de este PR de instrucciones.
Verificar `main`, base y estado local antes de continuar. Este PR draft no autoriza implementación ni despliegue.
