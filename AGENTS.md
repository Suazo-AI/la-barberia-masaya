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

Conservar la referencia recibida; confirmar la redacción y ubicación exacta antes de geocodificar o fijar un mapa.
El teléfono confirmado no demuestra que exista WhatsApp ni un sistema de reservas.
No inventar servicios, precios, horarios, promociones, testimonios, WhatsApp, reservas o prestaciones del negocio.
Registrar los datos faltantes y su fuente cuando se confirmen. No publicar placeholders como hechos reales.

## Dirección visual y spec

La dirección registrada es `hero03` cinematográfico, elegido por el usuario, seguido por su pedido de mejorarlo con fotos reales.
El usuario recibió un mockup actualizado; sigue pendiente la revisión visual y busca referencias globales.
No implementar ni desplegar nuevas pantallas hasta incorporar esa dirección en la spec reconciliada.
La aprobación previa de hero03 no constituye aprobación final del mockup actualizado.

El paquete canónico de spec está en el entorno cloud del orquestador padre.
No asumir que `/workspace` existe en esta PC. Obtener ruta y revisión exactas antes de usarlo.
Si aparece una spec canónica local, leerla, comparar decisiones y reconciliar antes de modificar; no crear una spec paralela.
Estas instrucciones no sustituyen el paquete de spec, las fotos reales ni la revisión humana.
No hace falta transferir imágenes para redactar instrucciones; para la implementación posterior deben verificarse origen, permiso de uso y recurso elegido.
Las referencias globales son evidencia de diseño, no autorización para copiar marca, contenido o fotos ajenas.

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
La autorización actual permite únicamente archivos de instrucciones en una rama aislada y un PR DRAFT.
No hacer merge, deploy, nuevas pantallas ni activar auto-merge. Acciones posteriores requieren la autorización vigente correspondiente.

No Mistakes (`kunchenguid/no-mistakes`) está INACTIVO.
La revisión registrada en el contexto recibido detectó bypass de sandbox por defecto, worktrees sin sandbox y atestaciones PR editables; incluye issue 1069 y licencia MIT.
No instalarlo ni ejecutarlo sin evaluación segura y autorización necesaria. Mantener checks deterministas independientes.

## Entrega

Informar archivos cambiados, evidencia realmente obtenida, checks ejecutados, limitaciones y siguiente acción.
Mantener [START-HERE.md](START-HERE.md) como índice breve de estado y decisiones.
No declarar el website terminado por tener documentación, mockups, tests o un PR abierto.
