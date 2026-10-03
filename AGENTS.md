# La Barbería Masaya: instrucciones del piloto

Leer [START-HERE.md](START-HERE.md) antes de trabajar.
Repo canónico público: https://github.com/Suazo-AI/la-barberia-masaya.
El alcance actual es únicamente el website de La Barbería Masaya.

## Separación de ámbitos

Mantener aquí solo instrucciones, spec, código y evidencia pertinentes a este website.
No mezclar instrucciones, assets, datos o historial de Chamba, LeParfum ni proyectos de video.
La fábrica reusable tiene ámbito independiente; no copiar aquí su kernel ni instrucciones de otros clientes.
AXI, suazo-axi y Forja no son repos canónicos de este piloto ni de la fábrica.
No incorporar CRM, bot Forja, integraciones de mensajería ni automatizaciones comerciales en el alcance actual.

## Verdad del negocio

Datos confirmados por el usuario:

- Negocio: La Barbería, Masaya, Nicaragua.
- Referencia de ubicación: junto a Cailagua; texto recibido `Pali4cuadrasoeste`.
- Teléfono del negocio: `+50585482197`.

El usuario confirmó el destino de Maps y el horario observado; conservar la fuente y comprobar el enlace exacto antes de incorporarlo a la sección de visita. La implementación actual no incluye esa sección.
El teléfono confirmado no demuestra que exista WhatsApp ni un sistema de reservas.
No inventar servicios, precios, horarios, promociones, testimonios, WhatsApp, reservas o prestaciones del negocio.
Registrar los datos faltantes y su fuente cuando se confirmen. No publicar placeholders como hechos reales.

## Dirección visual y spec

La selección vigente del usuario (2026-10-03) es la **opción 2, contundente, de la segunda ronda**. Sustituye la anterior hero03 cinematográfica. El hero ya está autorizado para implementación; no pedir una nueva aprobación del concepto seleccionado.

Composición: masthead negro, foto frontal del interior a la izquierda (~60%), texto marfil de gran peso a la derecha (~40%), un solo CTA “Llamar para consultar”. Copy y detalles en [SPEC.md](SPEC.md). Implementar con HTML/CSS semántico; nunca usar el mockup completo como página rasterizada.

Continuar el website de punta a punta por etapas, explicando decisiones creativas y mostrando referencias para las secciones aún no resueltas. La selección del hero no autoriza decidir silenciosamente el resto de la dirección creativa ni publicar el sitio. No inventar secciones de servicios/precios/galerías mientras falta la selección humana.

El paquete canónico está en este checkout. [docs/reconciliation.md](docs/reconciliation.md) conserva su relación con el PR documental #1 y las decisiones históricas. Leer la spec vigente, no aplicar una propuesta histórica como instrucción actual.

La imagen de trabajo procede de una mejora generativa de fotos históricas de 2023. No es documentación intacta ni prueba del estado actual. El usuario confirmó explícitamente el 2026-10-03 que hay permiso para usar las fotos y crear nuevas imágenes tomando como referencia el local. El derivado seleccionado y sus optimizaciones están autorizados para este proyecto; conservar la procedencia. No publicar capturas crudas de Maps ni referencias competidoras. Las referencias ajenas no autorizan copiar marca, contenido o imágenes.

## Trabajo y revisión

- Inspeccionar todas las instrucciones aplicables, herramientas, remotos, rama, worktrees y cambios locales antes de editar.
- Leer las skills pertinentes de `.agents/skills`; no activar skills ajenas al website. La memoria no concede autorización nueva.
- Trabajar desde requisitos identificados. Registrar decisiones con dueño, motivo, estado y fuente.
- Dividir tareas pequeñas con dueño único, dependencias, paths permitidos y criterios de aceptación. No comenzar tareas cuyo prerequisito siga pendiente.
- Usar rama o worktree aislado. Un worktree no es un sandbox. Preservar cambios existentes; no reset destructivo, limpieza ni movimientos masivos.
- La revisión independiente debe comprobar diff, requisitos y evidencia sobre el commit entregado. El autor no acepta su propia entrega.
- CI determinista manda para lo que comprueba. Reportes y atestaciones PR editables no sustituyen checks reales.
- Registrar comandos ejecutados, directorio, exit code, resultado y fecha por requisito. Nunca afirmar tests no corridos; indicar faltantes o bloqueos.
- No añadir dependencias, proveedores pagos, cuentas o cambios globales sin necesidad y autorización correspondiente.

## Evidencia UI/UX y aceptación humana

Cada cambio UI/UX debe llevar en su PR capturas reales antes/después de móvil y desktop, más video real de los flujos y animaciones afectados.
Identificar commit, URL/ruta, viewport, procedimiento de captura y requisito comprobado para cada lado.
El baseline debe ser la aplicación real previa. Un mockup, una reconstrucción o una imagen generada no es baseline de implementación.
Si todavía no hay aplicación, declarar esa ausencia y el commit base; no simular un antes. La primera implementación debe mostrar su resultado real en ambos tamaños.
Comprobar los comportamientos afectados: responsive, teclado/foco, accesibilidad, navegación, movimiento reducido y rendimiento según el alcance.
Redactar datos personales y secretos en las capturas sin ocultar la UI necesaria para revisar.
La aprobación visual humana es obligatoria antes de aceptar la UI para merge o publicación; una revisión automática no la sustituye.

## Seguridad y acciones externas

Este repo es público. Nunca commitear secretos, datos personales, notas privadas ni historial completo.
El contacto comercial confirmado arriba no autoriza publicar otros contactos o datos de personas.
No enviar mensajes externos ni contactar al negocio como parte de esta tarea.
La autorización vigente permite implementar el hero seleccionado y la base del website en una rama aislada, con PR DRAFT del código autorizado. El resto del diseño se trabaja con referencias y revisión humana. No hacer merge, deploy ni activar auto-merge antes de aprobación visual final y autorización de liberación. El permiso de fotos registrado para este proyecto no autoriza otros negocios, assets o destinatarios.

No Mistakes (`kunchenguid/no-mistakes`) está INACTIVO.
La revisión registrada en el contexto recibido detectó bypass de sandbox por defecto, worktrees sin sandbox y atestaciones PR editables; incluye issue 1069 y licencia MIT.
No instalarlo ni ejecutarlo sin evaluación segura y autorización necesaria. Mantener checks deterministas independientes.

## Entrega

Informar archivos cambiados, evidencia realmente obtenida, checks ejecutados, limitaciones y siguiente acción.
Mantener [START-HERE.md](START-HERE.md) como índice breve de estado y decisiones.
No declarar el website terminado por tener documentación, mockups, tests o un PR abierto.
