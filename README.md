# DonaVida

Red de donación de sangre en tiempo real y gestión de inventario entre bancos de sangre.
Trabajo Final de la Tecnicatura en Desarrollo Web — Grupo Código Rojo (Alday, Pizarro, Vulcano).

## Estructura

```
api/                 Backend: Node.js + Express
api/prisma/          Schema de la base (schema.prisma) y migraciones
web/                 Frontend: React + Vite
docs/                Documentación del equipo (contratos de API entre dominios)
docker-compose.yml   PostgreSQL 16 para desarrollo
```

## Requisitos

- [Node.js](https://nodejs.org/) 22 o superior
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (abierto antes de levantar la base)
- Git

## Levantar el proyecto por primera vez

Los comandos se corren desde la raíz del repo salvo que se indique otra carpeta.

**1. Base de datos**

```bash
docker compose up -d
```

Levanta PostgreSQL 16 en `localhost:5433` (usuario, contraseña y base: `donavida`).
Se usa el puerto **5433** y no el 5432 para no chocar con un PostgreSQL instalado en la máquina.

**2. Backend**

```bash
cd api
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

`npm run db:migrate` crea en tu base local todas las tablas (vacías).

En `api/.env` reemplazá `JWT_SECRET` por un valor largo y aleatorio. Para generarlo:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

La API queda en http://localhost:3000. Para comprobarlo: http://localhost:3000/api/health tiene que responder `{"ok":true}`.

**3. Frontend** (en otra terminal)

```bash
cd web
cp .env.example .env
npm install
npm run dev
```

El front queda en http://localhost:5173 y tiene que mostrar **"API: conectada"**.
El `.env` del front es opcional: si no existe, usa `http://localhost:3000` como URL de la API.

## Comandos del día a día

| Dónde | Comando | Qué hace |
|---|---|---|
| raíz | `docker compose up -d` | Levanta la base |
| raíz | `docker compose stop` | Apaga la base (los datos se conservan) |
| raíz | `docker compose down -v` | Borra la base **y todos sus datos** |
| `api/` | `npm run dev` | API con recarga automática al guardar |
| `api/` | `npm start` | API sin recarga automática |
| `api/` | `npm run db:migrate` | Aplica las migraciones pendientes / crea una nueva |
| `api/` | `npm run db:studio` | Abre Prisma Studio para ver y editar los datos |
| `web/` | `npm run dev` | Front en modo desarrollo |
| `web/` | `npm run build` | Build de producción en `web/dist` |
| `web/` | `npm run lint` | Linter (oxlint) |

## Base de datos y migraciones

Las tablas se definen como modelos en [`api/prisma/schema.prisma`](api/prisma/schema.prisma), traducidas del DER, y se crean con migraciones de Prisma.
En la base, tablas y columnas se llaman igual que en el DER (`unidad_sangre.fecha_vencimiento`); desde el código se usan en camelCase (`prisma.unidadSangre`, `fechaVencimiento`).

- **Agregar o cambiar tablas:** editar `schema.prisma` y, desde `api/`, correr
  `npm run db:migrate -- --name descripcion-del-cambio`.
  Se genera una carpeta en `api/prisma/migrations/` que **se sube al repo** junto con el cambio del schema.
- **Después de un `git pull` que trae migraciones nuevas:** desde `api/`, `npm run db:migrate` las aplica en tu base local.
- Nunca editar a mano una migración que ya está subida: si hay que corregir algo, se hace con una migración nueva.
- Prisma no sabe escribir `CHECK` ni índices únicos parciales en el schema. Los que hay están agregados a mano al
  final de la migración `init` (cupo de `franja_horaria`, turnos vigentes y unidades en transferencia) y Prisma no
  los toca en migraciones futuras. Para agregar uno nuevo: `npm run db:migrate -- --name x --create-only`,
  sumar el SQL al archivo generado y volver a correr `npm run db:migrate`.

## Autenticación y permisos por rol

Los roles son `donante`, `institucion` y `admin` (columna `usuario.rol`).

| Endpoint | Qué hace |
|---|---|
| `POST /api/auth/registro` | Crea un usuario. Body: `{ email, password, nombre, apellido, rol }`, con `rol` = `donante` o `institucion` |
| `POST /api/auth/login` | Body: `{ email, password }`. Devuelve `{ token, usuario }`; el token dura 8 horas |
| `GET /api/auth/me` | Devuelve el usuario del token |

El rol `admin` no se puede registrar por la API. Para crear uno, desde `api/`:

```bash
npm run crear-admin -- admin@donavida.com unaClaveLarga Nombre Apellido
```

Las rutas protegidas reciben el token en el header `Authorization: Bearer <token>` y usan los middlewares
de [`api/src/middlewares/auth.js`](api/src/middlewares/auth.js):

```js
const { autenticar, autorizar } = require('../middlewares/auth');

router.post('/necesidades', autenticar, autorizar('institucion'), crearNecesidad);
router.get('/instituciones/pendientes', autenticar, autorizar('admin'), listarPendientes);
// Dentro de la ruta están disponibles req.usuario.id (uuid) y req.usuario.rol
```

- `autenticar` responde **401** si falta el token, es inválido o está vencido.
- `autorizar(...roles)` responde **403** si el rol del usuario no está entre los permitidos.

## Contratos entre dominios

Los endpoints que un módulo consume de otro están documentados en [`docs/contratos-api.md`](docs/contratos-api.md).
Antes de cambiar la forma de uno de esos endpoints, avisá a quien lo consume.
