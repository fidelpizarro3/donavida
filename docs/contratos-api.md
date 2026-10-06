# Contratos de API entre dominios

> **Estado:** los endpoints de autenticación están implementados. El resto son acuerdos para implementar,
> basados en el DER y en [`api/prisma/schema.prisma`](../api/prisma/schema.prisma): el equipo tiene que validarlos
> y asignar responsables.

Este documento define **solo lo que un dominio consume de otro**, para que cada uno pueda avanzar en paralelo
sabiendo qué va a recibir. Los endpoints que usa un único dominio no van acá.

## 1. Dominios y responsables

Los tres dominios agrupan las cinco áreas del DER:

| Dominio | Áreas del DER | Tablas | Funcionalidades (N.º del Excel) | Responsable |
|---|---|---|---|---|
| **A. Cuentas y aptitud** | Identidad y acceso + Aptitud y normativa | `usuario`, `donante`, `institucion`, `usuario_institucion`, `suscripcion_push`, `pregunta`, `cuestionario_aptitud`, `respuesta_cuestionario`, `regla_elegibilidad`, `diferimiento`, `documento_normativa`, `consulta_asistente` | 1, 2, 3, 17, 18 | _a definir_ |
| **B. Demanda y agenda** | Demanda y convocatoria + Agenda y donación | `necesidad`, `convocatoria`, `alerta`, `franja_horaria`, `turno`, `donacion` | 4, 8, 9, 10, 11, 14, 16 | _a definir_ |
| **C. Inventario y red** | Inventario y red | `unidad_sangre`, `movimiento_unidad`, `transferencia`, `transferencia_item`, `stock_minimo` | 5, 6, 7, 12, 13, 15, 19 | _a definir_ |

**A confirmar:** el DER ubica `stock_minimo` en Identidad y acceso; acá se asigna a C porque lo usan el panel de
stock y la búsqueda de transferencias.

Cada dominio es dueño de sus tablas: solo su código escribe en ellas. Para leer o modificar datos de otro dominio
se usa el contrato correspondiente de este documento.

## 2. Convenciones comunes

- Todas las rutas empiezan con `/api` y reciben y devuelven JSON.
- **Nombres de campos:** los del DER en camelCase, tal como los devuelve Prisma (`id_institucion` → `idInstitucion`,
  `unidades_solicitadas` → `unidadesSolicitadas`). Los query params siguen la misma regla (`?idDonante=...`).
  Los campos calculados que no existen en la base (`distanciaKm`, `unidadesFaltantes`) se aclaran en cada contrato.
- **Ids:** `uuid` (texto).
- **Grupo sanguíneo:** siempre en dos campos, `grupoSanguineo` y `factorRh`, como en el DER.
- **Fechas:** con hora, ISO 8601 UTC (`2026-10-05T14:30:00.000Z`); solo fecha, `YYYY-MM-DD`; solo hora, `HH:MM`.
  Prisma devuelve las columnas `date` y `time` como `Date` completos: hay que formatearlas antes de responder.
- **Decimales** (latitud, longitud, distancias): como número. Prisma los devuelve como `Decimal`, que en JSON sale
  como texto: convertirlos con `Number()` antes de responder.
- **Contratos internos:** los marcados como _interno_ no tienen ruta HTTP; son funciones que el dominio dueño exporta
  desde su servicio y el otro dominio llama directamente (el backend es uno solo). Se usan cuando el dato no debe
  salir de la API (por ejemplo, las claves de las suscripciones push). Cualquier otro contrato también puede
  consumirse llamando a la función del servicio en lugar de hacer el pedido HTTP, con la misma entrada y salida.

### Autenticación

- Header `Authorization: Bearer <token>` en todas las rutas protegidas.
- El token lleva `{ sub: "<idUsuario>", rol: "<rol>" }` y dura 8 horas.
- Middlewares compartidos en `api/src/middlewares/auth.js`: `autenticar` deja `req.usuario = { id, rol }`
  (`id` es el `idUsuario`) y `autorizar(...roles)` restringe por rol.

### Errores

Todas las respuestas de error tienen la misma forma:

```json
{ "error": { "codigo": "SIN_PERMISO", "mensaje": "No tenés permiso para esta acción" } }
```

| Estado | `codigo` | Cuándo |
|---|---|---|
| 400 | `DATOS_INVALIDOS` | Faltan campos, tienen formato incorrecto o el JSON está mal formado |
| 401 | `NO_AUTENTICADO` | Falta el token |
| 401 | `TOKEN_INVALIDO` | El token es inválido o está vencido |
| 401 | `CREDENCIALES_INVALIDAS` | Login con email o contraseña incorrectos |
| 403 | `EMAIL_NO_VERIFICADO` | Login de un usuario con `email_verificado = false` (requiere validación previa) |
| 403 | `SIN_PERMISO` | El rol no tiene acceso |
| 403 | `CUENTA_INACTIVA` | Login de un usuario con `activo = false` |
| 404 | `NO_ENCONTRADO` | El recurso no existe |
| 409 | `CONFLICTO` | El estado actual no permite la operación (email ya registrado, unidad ya reservada, etc.) |
| 500 | `ERROR_INTERNO` | Error no previsto |

### Valores de los enums

Son los definidos en `schema.prisma`; cambiarlos requiere una migración.

| Campo | Valores |
|---|---|
| `rol` | `donante`, `institucion`, `admin` |
| `grupoSanguineo` | `A`, `B`, `AB`, `O` |
| `factorRh` | `positivo`, `negativo` |
| `componente` | `sangre_entera`, `globulos_rojos`, `plaquetas` |
| `sexo` (donante) | `femenino`, `masculino`, `x` |
| `institucion.tipo` | `hospital`, `banco_de_sangre` |
| `institucion.estado` | `pendiente`, `aprobada`, `rechazada`, `baja` |
| `urgencia` | `urgente` (aviso al celular), `normal` (aviso por correo) |
| `necesidad.estado` | `abierta`, `cubierta`, `cerrada_manual`, `vencida` |
| `convocatoria.estado` | `propuesta`, `enviada`, `cerrada` |
| `alerta.canal` | `push`, `email`, `whatsapp` |
| `alerta.estado` | `pendiente`, `enviada`, `aceptada`, `rechazada`, `cancelada` |
| `turno.estado` | `reservado`, `cancelado`, `asistio`, `ausente` |
| `donacion.resultado` | `realizada`, `rechazada` |
| `unidad_sangre.estado` | `disponible`, `reservada`, `usada`, `vencida`, `descartada` |
| `transferencia.estado` | `pendiente`, `aceptada`, `rechazada`, `expirada`, `cancelada`, `recibida` |
| `diferimiento.origen` | `cuestionario`, `donacion`, `institucion` |
| `consulta_asistente.tipo` | `cuestionario`, `necesidad`, `requisitos` |

## 3. Mapa de dependencias

| Consume | Provee | Contrato | Para qué (func.) |
|---|---|---|---|
| Todos | A | `POST /api/auth/registro`, `POST /api/auth/login`, `GET /api/auth/me` | Sesión y rol ✅ implementado |
| B, C | A | `GET /api/instituciones/:idInstitucion` | Datos, ubicación y estado de una institución |
| C | A | `GET /api/instituciones?estado=aprobada` | Instituciones de la red con su ubicación (12) |
| B | A | `GET /api/donantes/elegibles` | Candidatos para la convocatoria (8) |
| B | A | `GET /api/donantes/:idDonante/habilitacion` | Validar antes de reservar un turno (10) ✅ implementado |
| B | A | _interno_ `estaHabilitado(idDonante)` y `filtroDonantesHabilitados()` | "Está habilitado" para elegir a quién convocar (8) ✅ implementado |
| B | A | _interno_ `obtenerContactoDonante(idDonante)` | Canales y suscripciones push para enviar la alerta (9) |
| B | A | _interno_ `registrarAlertaEnviada(idDonante)` | Contar la alerta para el tope mensual (9) |
| B | A | `POST /api/donantes/:idDonante/donacion-registrada` | Reiniciar el período de espera y completar el grupo (11) ✅ implementado |
| B | A | `POST /api/donantes/:idDonante/diferimientos` | Marcar a una persona como no apta (3, 11) ✅ implementado |
| B | A | `POST /api/asistente/consultas` | Interpretar una necesidad escrita en lenguaje natural (16) |
| A | B | `GET /api/donaciones?idDonante=` | Historial y cantidad de donaciones para el carné (18) |
| A | B | `GET /api/turnos/proximo?idDonante=` | Próximo turno y su código QR para el carné (18) |
| C | B | `GET /api/necesidades` | Demanda abierta para el panel stock vs. demanda (15) |
| C | B | `PATCH /api/necesidades/:idNecesidad/cobertura` | Sumar lo cubierto por una transferencia (13, 14) |
| C | B | `GET /api/estadisticas/convocatorias` | Datos de convocatorias para el panel de estadísticas (19) |
| B | C | `GET /api/inventario/disponibilidad-red` | Buscar unidades en la red antes de convocar (12) |
| B | C | `POST /api/transferencias` | Pedir las unidades encontradas (12, 13) |
| B | C | `POST /api/unidades` | Cargar la unidad que genera una donación (5, 11) |

## 4. Detalle de cada contrato

### Dominio A — Cuentas y aptitud

#### `POST /api/auth/registro` ✅ implementado

- **Rol:** público. Solo se puede registrar como `donante` o `institucion`; los admin se crean con `npm run crear-admin`.
- **Body para rol `donante` (TAREA-2):**
  ```json
  {
    "email": "ana@mail.com",
    "password": "entre 8 y 72 caracteres",
    "nombre": "Ana",
    "apellido": "Paz",
    "rol": "donante",
    "documento": "35123456",
    "fechaNacimiento": "1995-04-10",
    "sexo": "femenino",
    "grupoSanguineo": "O",
    "factorRh": "positivo",
    "contactoHoraDesde": "09:00",
    "contactoHoraHasta": "18:00"
  }
  ```
  - `documento`, `fechaNacimiento` (edad mínima 16 años) y `sexo` son obligatorios para donantes. El documento se normaliza automáticamente eliminando puntos y guiones.
  - `grupoSanguineo` y `factorRh` son opcionales: si se desconoce el grupo, ambos se omiten o envían como `null` (se completan en la 1ra donación). Si se informa uno, deben enviarse ambos.
  - `contactoHoraDesde` y `contactoHoraHasta` son opcionales: si se informan, deben enviarse ambos en formato `HH:MM` con `desde < hasta`.
- **Body para rol `institucion`:** `{ "email": "...", "password": "...", "nombre": "...", "apellido": "...", "rol": "institucion" }`.
- **201:** `{ "idUsuario": "<uuid>", "email": "ana@mail.com", "nombre": "Ana", "apellido": "Paz", "rol": "donante", "emailVerificado": false, "mensaje": "..." }`
- Envía un correo con el enlace de activación `APP_URL/?token=<token>` (vence en 24 horas). El token **nunca** viaja en
  la respuesta. Si el correo no se pudo enviar, el registro igual se completa y `mensaje` indica que se pida un enlace nuevo.
- **Errores:** 400 `DATOS_INVALIDOS`, 409 `CONFLICTO` (email o documento ya registrado).

#### `POST /api/auth/verificar-email` ✅ implementado

- **Rol:** público. Lo llama el front cuando se abre el enlace del correo.
- **Body:** `{ "token": "<token del enlace>" }` (también acepta `?token=...` por query param).
- **200:** `{ "ok": true, "mensaje": "Correo verificado exitosamente. Tu cuenta está activa.", "usuario": { ... } }`
- **Errores:** 400 `DATOS_INVALIDOS`, 400 `TOKEN_INVALIDO` (token vencido, corrupto o ajeno a verificación de email), 404 `NO_ENCONTRADO`.

#### `POST /api/auth/reenviar-verificacion` ✅ implementado

- **Rol:** público. Para cuando el enlace venció o el correo no llegó.
- **Body:** `{ "email": "ana@mail.com" }`
- **200:** `{ "ok": true, "mensaje": "..." }`. Responde lo mismo exista o no la cuenta (no revela qué emails están
  registrados); solo envía un correo si la cuenta existe y todavía no está verificada.
- **Errores:** 400 `DATOS_INVALIDOS`.

#### `POST /api/auth/login` ✅ implementado

- **Rol:** público.
- **Body:** `{ "email": "ana@mail.com", "password": "..." }`
- **200:** `{ "token": "eyJ...", "usuario": { "idUsuario": "<uuid>", "email": "ana@mail.com", "nombre": "Ana", "apellido": "Paz", "rol": "donante" } }`
- **Errores:** 401 `CREDENCIALES_INVALIDAS` (mismo mensaje si falla email o contraseña), 403 `EMAIL_NO_VERIFICADO` (si aún no validó su correo), 403 `CUENTA_INACTIVA`.

#### `GET /api/auth/me` ✅ implementado

- **Rol:** cualquier usuario autenticado.
- **200:** el mismo objeto `usuario` que devuelve el login.
- **Errores:** 401 `NO_AUTENTICADO` / `TOKEN_INVALIDO`, 404 `NO_ENCONTRADO`.

#### `GET /api/donantes/perfil` ✅ implementado

- **Rol:** `donante` autenticado.
- **200:**
  ```json
  {
    "idDonante": "<uuid>",
    "idUsuario": "<uuid>",
    "nombre": "Ana",
    "apellido": "Paz",
    "email": "ana@mail.com",
    "documento": "35123456",
    "fechaNacimiento": "1995-04-10",
    "sexo": "femenino",
    "grupoSanguineo": "O",
    "factorRh": "positivo",
    "contactoHoraDesde": "09:00",
    "contactoHoraHasta": "18:00",
    "alertasPausadasHasta": null
  }
  ```
- **Errores:** 401 `NO_AUTENTICADO`, 403 `SIN_PERMISO`, 404 `NO_ENCONTRADO`.

#### `PATCH /api/donantes/perfil` ✅ implementado

- **Rol:** `donante` autenticado.
- **Body (campos opcionales):**
  ```json
  {
    "contactoHoraDesde": "14:00",
    "contactoHoraHasta": "20:00",
    "alertasPausadasHasta": "2026-11-15"
  }
  ```
  - `contactoHoraDesde` y `contactoHoraHasta`: formato `"HH:MM"`. Si se envían, deben indicarse ambos con `desde < hasta`, o ambos en `null` para desconfigurar.
  - `alertasPausadasHasta`: fecha `"YYYY-MM-DD"` presente o futura para pausar alertas, o `null` para reanudarlas de inmediato.
- **200:** el perfil actualizado con la misma estructura que en `GET /api/donantes/perfil`.
- **Errores:** 400 `DATOS_INVALIDOS`, 401 `NO_AUTENTICADO`, 403 `SIN_PERMISO`, 404 `NO_ENCONTRADO`.

#### `GET /api/instituciones/:idInstitucion`

- **Rol:** cualquier usuario autenticado.
- **200:**
  ```json
  {
    "idInstitucion": "<uuid>",
    "nombre": "Hospital Central",
    "direccion": "Av. Argentina 1200, Neuquén",
    "tipo": "hospital",
    "estado": "aprobada",
    "latitud": -38.9516,
    "longitud": -68.0591,
    "intervaloDonacionDias": 56
  }
  ```
- **Errores:** 404 `NO_ENCONTRADO`.
- No incluye `documentacionUrl` ni `motivoRechazo`: son datos internos de la verificación.

#### `GET /api/instituciones?estado=aprobada`

- **Rol:** `institucion`, `admin`.
- **200:** lista de objetos con la misma forma que `GET /api/instituciones/:idInstitucion`.
- C no debe proponer ni aceptar transferencias con instituciones que no estén `aprobada` (una institución dada de
  baja deja de recibir pedidos, func. 1).

#### `GET /api/donantes/elegibles`

- **Rol:** `institucion`.
- **Query:** `grupoSanguineo`, `factorRh`, `componente` (lo que necesita el paciente), `idInstitucion`, `radioKm`.
- **Qué resuelve A:** grupo compatible, `aptoDesde` vencido o nulo sin diferimientos vigentes, alertas no pausadas
  (`alertasPausadasHasta`), sin llegar al tope mensual (`alertasMesActual < topeAlertasMes`) y dentro del radio.
- **200:**
  ```json
  [
    {
      "idDonante": "<uuid>",
      "nombre": "Ana",
      "apellido": "Paz",
      "grupoSanguineo": "O",
      "factorRh": "negativo",
      "distanciaKm": 4.2,
      "motivo": "Grupo compatible (O negativo dona a todos) y habilitada desde 2026-08-01"
    }
  ]
  ```
  `distanciaKm` y `motivo` son calculados. El `motivo` es el que ve el donante en la alerta (func. 9).
- El orden, el recorte por cupo de agenda y la confirmación del hospital los resuelve B (func. 8).

#### `GET /api/donantes/:idDonante/habilitacion` ✅ implementado

¿Puede donar hoy? Un donante está habilitado si respondió el cuestionario y no tiene ningún diferimiento vigente.
Todo lo que impide donar es un `diferimiento`, con `origen` = `cuestionario` (una respuesta), `donacion` (la espera
de 56 días) o `institucion` (el hospital lo marcó no apto).

- **Rol:** el propio `donante`, o `institucion` (de una institución aprobada).
- **200 para el donante:**
  ```json
  {
    "habilitado": false,
    "aptoDesde": "2026-11-20",
    "motivo": "Donó sangre el 25/09/2026. Deben pasar 56 días entre donaciones de sangre entera.",
    "cuestionarioCompleto": true,
    "diferimientos": [
      { "idDiferimiento": "<uuid>", "origen": "donacion", "motivo": "Donó sangre el 25/09/2026. ...", "desde": "2026-09-25", "hasta": "2026-11-20" }
    ]
  }
  ```
  - `aptoDesde` es la fecha de reingreso: el primer día en que puede volver a donar. Es `null` si está habilitado, si
    le falta el cuestionario o si el diferimiento no tiene fecha de fin.
  - `motivo` y `aptoDesde` salen del diferimiento que termina último; `diferimientos` trae todos los vigentes.
  - Sin cuestionario respondido: `habilitado: false`, `cuestionarioCompleto: false` y el motivo lo explica.
- **200 para la institución:** solo `habilitado`, `aptoDesde`, `motivo` y `cuestionarioCompleto`. Las respuestas del
  cuestionario son datos de salud: si el motivo viene de una respuesta, se reemplaza por un texto genérico.
- **Errores:** 403 `SIN_PERMISO` (otro donante, o institución no aprobada), 404 `NO_ENCONTRADO`.

#### _interno_ `estaHabilitado(idDonante)` y `filtroDonantesHabilitados()` ✅ implementado

Exportadas por `api/src/services/habilitacion.js` para la selección de donantes a convocar (func. 8).

- `await estaHabilitado(idDonante)` → `true` o `false` (un donante que no existe da `false`).
- `await obtenerHabilitacion(idDonante)` → el mismo objeto que ve el donante en el endpoint, o `null` si no existe.
- `filtroDonantesHabilitados()` → un filtro de Prisma para traer muchos donantes habilitados en una sola consulta:
  ```js
  const { filtroDonantesHabilitados } = require('../services/habilitacion');
  const candidatos = await prisma.donante.findMany({ where: { ...filtroDonantesHabilitados(), grupoSanguineo: 'O' } });
  ```
- `donante.apto_desde` guarda la fecha de reingreso como resumen, pero la fuente de verdad son los diferimientos
  (queda en `null` cuando no hay fecha de fin): para saber si alguien puede donar hay que usar estas funciones.

#### `GET /api/donantes/cuestionario` ✅ implementado

- **Rol:** `donante`.
- **200:**
  ```json
  {
    "ultimaRespuestaEn": "2026-10-05T23:30:00.000Z",
    "preguntas": [
      { "idPregunta": "<uuid>", "codigo": "TATUAJE", "texto": "¿Te hiciste un tatuaje...?", "tipo": "fecha", "puedeCambiar": true, "respuestaAnterior": "no", "hayQueResponder": true },
      { "idPregunta": "<uuid>", "codigo": "ENFERMEDAD_TRANSMISIBLE", "texto": "¿Tenés o tuviste...?", "tipo": "si_no", "puedeCambiar": false, "respuestaAnterior": "no", "hayQueResponder": false }
    ]
  }
  ```
  - `hayQueResponder` es `false` cuando la pregunta ya tiene respuesta y esa respuesta no cambia con el tiempo
    (`pregunta.puede_cambiar = false`): solo se repregunta lo que puede cambiar.
  - Solo trae las preguntas que aplican al sexo del donante (la de embarazo no se le hace a un donante masculino).

#### `POST /api/donantes/cuestionario` ✅ implementado

- **Rol:** `donante`.
- **Body:** `{ "respuestas": [{ "idPregunta": "<uuid>", "valor": "no" }, { "idPregunta": "<uuid>", "valor": "2026-09-05" }] }`,
  con una respuesta por cada pregunta que tenga `hayQueResponder: true`.
  - Preguntas `si_no`: `"si"` o `"no"`.
  - Preguntas `fecha`: la fecha del hecho (`YYYY-MM-DD`, no futura) o `"no"` si no le pasó.
- **Qué hace A:** guarda el cuestionario con todas sus respuestas (las que no se repreguntan conservan la anterior),
  reemplaza los diferimientos de las preguntas respondidas según la regla de cada una y actualiza `aptoDesde`.
- **201:** la habilitación resultante, con la misma forma que `GET /api/donantes/:idDonante/habilitacion`.
- **Errores:** 400 `DATOS_INVALIDOS` (falta una respuesta o tiene un valor inválido; no se guarda nada).

#### _interno_ `obtenerContactoDonante(idDonante)`

- **Devuelve:**
  ```js
  {
    email: 'ana@mail.com',
    avisoPush: true, avisoEmail: true, avisoWhatsapp: false,
    contactoHoraDesde: '09:00', contactoHoraHasta: '20:00',
    suscripcionesPush: [{ endpoint: '...', p256dh: '...', auth: '...' }] // solo las activas
  }
  ```
- Es interno porque las claves de `suscripcion_push` no deben salir de la API.

#### _interno_ `registrarAlertaEnviada(idDonante)`

- Suma 1 a `donante.alertasMesActual`. B la llama cada vez que envía una alerta.
- **Devuelve:** `{ alertasMesActual: 3, topeAlertasMes: 4 }`

#### `POST /api/donantes/:idDonante/donacion-registrada` ✅ implementado

La llama quien registra la donación (func. 11). También se puede llamar directo a
`registrarDonacion(idDonante, { fecha, grupoSanguineo, factorRh })` de `api/src/services/habilitacion.js`.

- **Rol:** `institucion` (de una institución aprobada).
- **Body:** `{ "fecha": "2026-09-25", "grupoSanguineo": "O", "factorRh": "negativo" }`
  - `fecha` es obligatoria y no puede ser futura.
  - `grupoSanguineo` y `factorRh` son los confirmados en la donación: se envían juntos o se omiten. A solo los
    guarda si el donante no los tenía (func. 2 y 11).
- **Qué hace A:** crea el `diferimiento` con origen `donacion` desde `fecha` hasta `fecha` + los días de la regla
  `INTERVALO_SANGRE_ENTERA` de `regla_elegibilidad` (56), y actualiza `aptoDesde`. El plazo sale de esa regla, no de
  `institucion.intervalo_donacion_dias`. Avisar dos veces la misma fecha no duplica el diferimiento.
- **200:** `{ "habilitado": false, "aptoDesde": "2026-11-20" }`
- **Errores:** 400 `DATOS_INVALIDOS`, 403 `SIN_PERMISO`, 404 `NO_ENCONTRADO`.

#### `POST /api/donantes/:idDonante/diferimientos` ✅ implementado

El hospital marca a una persona como no apta por un motivo médico.

- **Rol:** `institucion` (de una institución aprobada).
- **Body:** `{ "motivo": "Hemoglobina baja en el control previo", "desde": "2026-10-05", "hasta": "2026-11-04" }`
  - `motivo` es obligatorio (hasta 500 caracteres) y es lo que va a leer el donante.
  - `desde` es opcional (por defecto, hoy) y no puede ser futura.
  - `hasta` es opcional: es el primer día en que puede volver a donar y tiene que ser futura. Sin `hasta`, el
    diferimiento no tiene fecha de fin.
- **Qué hace A:** crea el `diferimiento` con origen `institucion` (sin regla asociada) y actualiza `aptoDesde`.
- **201:** `{ "idDiferimiento": "<uuid>", "habilitado": false, "aptoDesde": "2026-11-04" }`
- **Errores:** 400 `DATOS_INVALIDOS`, 403 `SIN_PERMISO`, 404 `NO_ENCONTRADO`.

#### `POST /api/asistente/consultas`

- **Rol:** `institucion` para `tipo: "necesidad"`.
- **Body:** `{ "tipo": "necesidad", "textoIngresado": "necesito seis unidades de O negativo para mañana a la mañana" }`
- **201:**
  ```json
  {
    "idConsultaAsistente": "<uuid>",
    "interpretacion": {
      "grupoSanguineo": "O",
      "factorRh": "negativo",
      "componente": null,
      "unidadesSolicitadas": 6,
      "urgencia": "urgente",
      "fechaLimite": "2026-10-06"
    },
    "datosFaltantes": ["componente"]
  }
  ```
  Si falta un dato o es ambiguo queda en `null` y aparece en `datosFaltantes`: B lo pregunta en vez de completarlo (func. 16).
- Cuando el hospital confirma y B publica la necesidad, B llama a
  `PATCH /api/asistente/consultas/:idConsultaAsistente` con `{ "confirmadoPorUsuario": true }`.

### Dominio B — Demanda y agenda

#### `GET /api/donaciones?idDonante=`

- **Rol:** `institucion`, o el propio `donante`.
- **200:**
  ```json
  [
    { "idDonacion": "<uuid>", "fecha": "2026-09-25", "resultado": "realizada", "idInstitucion": "<uuid>", "nombreInstitucion": "Hospital Central" }
  ]
  ```
  `nombreInstitucion` es calculado. Ordenado de la más reciente a la más antigua.

#### `GET /api/turnos/proximo?idDonante=`

- **Rol:** `institucion`, o el propio `donante`.
- **200:**
  ```json
  {
    "idTurno": "<uuid>",
    "estado": "reservado",
    "codigoQr": "<código>",
    "fecha": "2026-10-06",
    "horaInicio": "08:00",
    "horaFin": "08:30",
    "idInstitucion": "<uuid>"
  }
  ```
  `fecha`, `horaInicio`, `horaFin` e `idInstitucion` salen de la `franja_horaria` del turno. Si no tiene turno, responde `null`.

#### `GET /api/necesidades`

- **Rol:** `institucion`, `admin`.
- **Query:** `idInstitucion` (opcional para `admin`), `estado` (ej.: `abierta`).
- **200:**
  ```json
  [
    {
      "idNecesidad": "<uuid>",
      "idInstitucion": "<uuid>",
      "grupoSanguineo": "O",
      "factorRh": "negativo",
      "componente": "globulos_rojos",
      "unidadesSolicitadas": 6,
      "unidadesCubiertas": 2,
      "unidadesFaltantes": 4,
      "urgencia": "urgente",
      "fechaLimite": "2026-10-06",
      "estado": "abierta",
      "creadaEn": "2026-10-05T09:12:00.000Z",
      "cerradaEn": null
    }
  ]
  ```
  `unidadesFaltantes` es calculado (`unidadesSolicitadas - unidadesCubiertas`).

#### `PATCH /api/necesidades/:idNecesidad/cobertura`

- **Rol:** `institucion`.
- **Body:** `{ "unidades": 4, "idTransferencia": "<uuid>" }`
- **Qué hace B:** suma `unidades` a `unidadesCubiertas`. Si no queda nada por cubrir, pasa la necesidad a `cubierta`,
  completa `cerradaEn` y dispara el aviso de cierre a los donantes (func. 14).
- **200:** la necesidad actualizada, con la misma forma que en `GET /api/necesidades`.
- **Errores:** 409 `CONFLICTO` si la necesidad ya no está `abierta`.

#### `GET /api/estadisticas/convocatorias`

- **Rol:** `institucion`, `admin`.
- **Query:** `idInstitucion` (opcional para `admin`), `desde`, `hasta`, `grupoSanguineo` y `factorRh` (opcionales).
- **200:**
  ```json
  {
    "necesidadesPublicadas": 20,
    "necesidadesCubiertas": 17,
    "horasPromedioHastaCubrir": 30.5,
    "cubiertasPorDonantes": 11,
    "cubiertasPorTransferencia": 4,
    "cubiertasPorAmbas": 2,
    "donantesConvocados": 140,
    "donantesQueRespondieron": 52
  }
  ```

### Dominio C — Inventario y red

#### `GET /api/inventario/disponibilidad-red`

- **Rol:** `institucion`.
- **Query:** `grupoSanguineo`, `factorRh`, `componente`, `cantidad`, `idInstitucion` (la que pide).
- **Qué resuelve C:** solo unidades `disponible` de instituciones `aprobada` (distintas de la que pide) que, después de
  prestar, sigan por encima de su `stock_minimo`.
- **200** (ordenado por distancia y por días que le quedan a cada unidad):
  ```json
  [
    {
      "idInstitucion": "<uuid>",
      "nombre": "Banco de Sangre Regional",
      "distanciaKm": 6.1,
      "unidades": [{ "idUnidadSangre": "<uuid>", "codigo": "U-000210", "fechaVencimiento": "2026-10-03", "diasRestantes": 5 }]
    }
  ]
  ```
  `nombre`, `distanciaKm` y `diasRestantes` son calculados.
- **200 con `[]`** si no hay cobertura en la red: B convoca donantes por todo lo que falta.

#### `POST /api/transferencias`

- **Rol:** `institucion` (la solicitante).
- **Body:** `{ "idInstitucionProveedora": "<uuid>", "idNecesidad": "<uuid>", "idsUnidadSangre": ["<uuid>", "<uuid>"] }`
  (`idNecesidad` es opcional: una transferencia se puede iniciar sin necesidad publicada, func. 13).
  La institución solicitante sale del usuario autenticado.
- **Qué hace C:** crea la `transferencia`, un `transferencia_item` por unidad y pasa las unidades a `reservada`,
  todo en una transacción.
- **201:** `{ "idTransferencia": "<uuid>", "estado": "pendiente", "plazoRespuesta": "2026-10-05T18:00:00.000Z" }`
- **Errores:** 409 `CONFLICTO` si alguna unidad ya no está `disponible`.
- Cuando se confirma la recepción, C llama a `PATCH /api/necesidades/:idNecesidad/cobertura`. Si la institución que
  presta no responde antes de `plazoRespuesta`, la transferencia pasa a `expirada`, las unidades vuelven a
  `disponible` y B convoca donantes.

#### `POST /api/unidades`

- **Rol:** `institucion`.
- **Body:**
  ```json
  {
    "idInstitucion": "<uuid>",
    "idDonacion": "<uuid>",
    "grupoSanguineo": "O",
    "factorRh": "negativo",
    "componente": "globulos_rojos",
    "fechaExtraccion": "2026-09-25"
  }
  ```
  `idDonacion` es opcional: se completa cuando la unidad sale de una donación registrada en el sistema.
  `codigo` también es opcional: si no viene, C lo genera.
- **Qué hace C:** calcula `fechaVencimiento` según el componente y registra el `movimiento_unidad` de tipo `ingreso`.
- **201:** `{ "idUnidadSangre": "<uuid>", "codigo": "U-000212", "fechaVencimiento": "2026-11-06", "estado": "disponible" }`

## 5. Cómo se cambia un contrato

- Agregar un campo nuevo a una respuesta no rompe a nadie: se puede hacer avisando.
- Quitar o renombrar un campo, o cambiar su tipo, se acuerda antes con quien consume el contrato.
- Todo cambio se hace por pull request, actualizando este documento en el mismo PR.
