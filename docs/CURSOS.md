# Cursos y jornadas

El modulo de cursos amplía `Proyectos` sin convertir ni modificar los proyectos existentes.
Todas las filas anteriores conservan el tipo `Evento`; grupos, ordenes y jornadas son opcionales.

## Despliegue

Aplicar primero el SQL y luego desplegar la aplicacion:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/projects_courses.sql
npm run build
```

El SQL es idempotente. Crea las tablas de grupos, jornadas, ordenes y asistencias, ademas del
bucket privado `wm-private` para comprobantes nuevos de cursos. No mueve archivos ni actualiza
inscripciones existentes.

## Crear un curso

1. En `Proyectos`, crear o editar un proyecto y elegir `Curso con horarios`.
2. Definir el enlace publico, las instrucciones de pago y activar la inscripcion publica.
3. Crear al menos un grupo abierto con precio y capacidad.
4. Agregar las jornadas con sus fechas y horas.
5. Compartir `/cursos/<enlace-publico>` con los estudiantes.

Cuando un pago cambia a `Confirmado`, el flujo existente genera el QR y envia el correo. En los
cursos, el correo incluye el grupo y todas sus jornadas. El lector de cada jornada registra una
asistencia independiente sin marcar el QR como usado para el resto del curso.

## Integracion con otra web

Una landing externa puede usar `GET` y `POST /api/public/courses/<enlace-publico>`. Las llamadas
deben salir desde su servidor con:

```text
Authorization: Bearer <COURSES_API_SECRET>
```

Configurar la misma variable `COURSES_API_SECRET` en el ERP y en el servidor de la landing. La
clave nunca debe enviarse al navegador.
