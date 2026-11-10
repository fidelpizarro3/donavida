# Probar en local las funcionalidades del 75%

Esta rama (`prueba-entorno`) es `main` más cuatro archivos:
- esta guía;
- [`api/scripts/preparar-prueba-75.js`](api/scripts/preparar-prueba-75.js): arma una **base aparte**, `donavida_prueba75`, con los datos de prueba;
- [`api/scripts/api-prueba-75.js`](api/scripts/api-prueba-75.js): levanta la API contra esa base;
- la lista de funcionalidades, en [`docs/DonaVida_ListaFuncionalidades_CodigoRojo.xlsx`](docs/DonaVida_ListaFuncionalidades_CodigoRojo.xlsx).

La prueba usa el mismo Postgres del `docker-compose`, pero **no toca tu base de desarrollo** (`donavida`). Así lo que ya tenés cargado no se mezcla con la prueba y los resultados son exactamente los de la guía.

**Para la persona:**
1. Bajá la rama: `git fetch origin` y después `git checkout prueba-entorno`.
2. Abrí Claude Code en la raíz del repo y decile: **"Hacé lo que dice PRUEBA-ENTORNO-75.md"**.
3. **Cuando termines:**
   - Cerrá la API de prueba y levantá la de siempre (`npm run dev` en `api/`): vuelve a tu base, que quedó igual.
   - Al volver a `main`, estos cuatro archivos desaparecen de la carpeta, porque solo viven en esta rama.
   - Si querés borrar la base de prueba: `docker compose exec db dropdb -U donavida donavida_prueba75`.

---

## Para Claude

Preparame la compu para probar a mano las funcionalidades del 75% de DonaVida (12, 13, 14 y 15 de la lista del Excel) y después dame el paso a paso para hacer las pruebas: es la guía que está al final de este archivo.

### Qué es cada funcionalidad (numeración del Excel, que no coincide con la de los issues)

| Funcionalidad | Issue | Quién | Qué hace |
|---|---|---|---|
| 12. Búsqueda de cobertura en la red | TAREA-14 | Matteo | Antes de convocar donantes, busca unidades compatibles en otros hospitales (más cerca primero, respetando su stock mínimo) |
| 13. Transferencia entre instituciones | TAREA-12 | Joaquín | Pedir unidades a otra institución: acepta o rechaza en 24 h, y la que pidió confirma la recepción |
| 14. Cierre de la necesidad y agradecimiento | TAREA-13 | Joaquín | Cuando la necesidad se cubre, se cierra la convocatoria, se agradece a los que no fueron y se decide qué pasa con los turnos |
| 15. Stock contra demanda | TAREA-15 | Fidel | Cuadro por grupo sanguíneo con semáforo, días de cobertura y la opción de pedir a la red desde ahí |

Los criterios de aceptación de cada una están en el Excel de `docs/`.

### Reglas (respetalas siempre)

- **El repo no se toca:** no modifiques archivos versionados, no hagas commit ni push y no cambies la configuración de git. Si `npm install` cambia algún `package-lock.json` (pasa con otra versión de npm), no lo commitees: avisame y se descarta con `git checkout -- <archivo>`.
- **La rama:** si `git status` muestra cambios sin commitear o no estoy en la rama `prueba-entorno`, preguntame antes de cambiar de rama o hacer pull.
- **Solo lo de DonaVida:** usá únicamente los contenedores de `docker-compose.yml` (proyecto `donavida`: `db` en el puerto 5433 y `mail`, que es Mailpit, en 1025/8025). Si alguno de los puertos 5433, 1025, 8025, 3000 o 5173 está ocupado por otra cosa, **preguntame** antes de cerrar o tocar nada.
- **`api/.env`** tiene secretos: nunca muestres su contenido. Si no existe, crealo copiando `api/.env.example` y poné en `JWT_SECRET` un valor aleatorio largo, por ejemplo con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Está en `.gitignore`.
- **Base local:** si el `DATABASE_URL` de `api/.env` no apunta a `localhost`, frená y preguntame. No cambies el `DATABASE_URL`.
- **Mi base de desarrollo (`donavida`) no se toca:** ni migraciones, ni datos, ni borrarla. Todo lo de la prueba va a la base aparte, `donavida_prueba75`, que arma `preparar-prueba-75.js`. Ese script crea la base si no existe, le aplica las migraciones con `prisma migrate deploy` y carga los datos.
- **Migraciones:** nunca uses `prisma migrate dev`, que pide confirmación interactiva.
- **La API de la prueba** se levanta con `node api/scripts/api-prueba-75.js`, no con `npm run dev`. Usa todo mi `api/.env` y solo cambia el nombre de la base.

### Qué tenés que hacer

1. **Revisar la rama.** Corré `git status` y confirmá que estás en `prueba-entorno`, sin cambios.
2. **Docker.** Si no está andando, avisame que abra Docker Desktop o abrilo vos si podés. Después, desde la raíz del repo, corré `docker compose up -d` y comprobá que `db` y `mail` estén corriendo.
3. **Configuración.** Confirmá que `api/.env` exista (ver las reglas) sin mostrar su contenido. Revisá también que el `DATABASE_URL` apunte a `localhost:5433/donavida`.
4. **Dependencias.** Si hay una API de DonaVida corriendo, cerrala antes: en Windows bloquea archivos de Prisma. Después corré `npm install` en `api/` y en `web/` (el front ahora usa `recharts` para el gráfico de la funcionalidad 15), y en `api/`, `npx prisma generate`.
5. **Base y datos de prueba.** Desde la raíz del repo, corré `node api/scripts/preparar-prueba-75.js`.
   - **Revisar el resultado:** tiene que decir "Base de prueba: …/donavida_prueba75 (migraciones al día)". Al final tiene que imprimir **8 líneas `OK`** y "Todo en orden para empezar a probar". Si alguna dice `FALLA`, mostrame la salida y no sigas.
   - **Las fechas:** guardá las que imprime (hoy, el turno de Bruno, las fechas límite y las franjas), porque las vas a usar en la guía.
6. **Servidores, en segundo plano.**
   - **La API de prueba:** desde la raíz del repo, `node api/scripts/api-prueba-75.js`. Queda en http://localhost:3000 y al arrancar dice "API de PRUEBA: base donavida_prueba75". Si el puerto 3000 está ocupado por mi API de siempre (`npm run dev`), cerrala; si es otra cosa, preguntame.
   - **El front:** `npm run dev` en `web/`, que queda en http://localhost:5173. Si ya estaba corriendo desde antes del `npm install`, **reinicialo**, porque Vite se queda con el error "Failed to resolve import recharts".
7. **Comprobaciones.**
   - **El login:** `POST http://localhost:3000/api/auth/login` con `{"email":"admin@prueba.test","password":"Prueba2026"}` tiene que devolver un token. Si da 401, la API que está en el 3000 es la de siempre y no la de prueba.
   - **El front y Mailpit:** http://localhost:5173 y http://localhost:8025 tienen que responder.
8. **La guía.** Dame **completa, sin resumirla,** la guía de prueba de abajo. Poné las fechas reales que imprimió el script donde dice "en 2 días", "en 12 días", etc.

### Si algo falla

- **"Failed to resolve import recharts":** Vite arrancó antes del `npm install`. Cerrá **todos** los procesos de Vite de DonaVida (detener la tarea a veces deja vivo el proceso hijo y el 5173 queda ocupado) y levantalo con `npm run dev -- --force`.
- **`EPERM` en `npx prisma generate`:** hay una API de DonaVida corriendo que bloquea el archivo. Cerrala y repetí.
- **Docker no responde:** Docker Desktop está cerrado.
- **El script dice que la carpeta no es `api/`:** falta el `npm install` en `api/`.
- **Fallan las migraciones de la base de prueba:** mostrame el error. No toques la base `donavida`.

---

## La guía de prueba (dásela a la persona, con las fechas reales)

La clave de todos los usuarios es `Prueba2026`.

| Usuario | Quién | Para qué |
|---|---|---|
| `hospital@prueba.test` | Laura Gómez · **Hospital del Valle** | El que pide |
| `banco@prueba.test` | Martín Ruiz · **Banco de Sangre Regional** (a unos 4 km) | Presta |
| `clinica@prueba.test` | Sofía Herrera · **Clínica Los Álamos** (a unos 16 km) | Presta |
| `admin@prueba.test` | Admin Prueba | Ve el cuadro de stock y demanda de toda la red |
| `ana@prueba.test` | Ana Paz · O− | Necesidad 1: aceptó, turno **hoy** |
| `bruno@prueba.test` | Bruno Díaz · O− | Necesidad 1: aceptó, turno **en 2 días** |
| `carla@prueba.test` | Carla Ríos · O− | Necesidad 1: **no respondió** |
| `diego@prueba.test` y `elena@prueba.test` | A+ | Necesidad 2: no respondieron |

### Lo que ya está cargado

- **Necesidad 1:** O− glóbulos rojos, 3 unidades, urgente, con fecha límite **en 5 días**. La convocatoria ya salió para Ana, Bruno y Carla.
- **Necesidad 2:** A+ plaquetas, 2 unidades, con fecha límite **en 4 días**. La convocatoria ya salió para Diego y Elena.
- **Stock del Hospital (glóbulos rojos):**
  - 1 O−, que nunca le aparece en sus propias búsquedas;
  - 2 A+, con 15 usadas en los últimos 30 días;
  - 4 B+, dos de ellas por vencer, con 3 usadas en 30 días.
- **Stock del Banco:**
  - 3 O− glóbulos rojos con **stock mínimo 1**, así que presta solo 2;
  - 1 O− **vencida**;
  - 3 A+ glóbulos rojos;
  - 2 A+ plaquetas;
  - 1 B+ plaquetas.
- **Stock de la Clínica:** 1 O−, 1 A− y 1 AB+, todas glóbulos rojos.
- **Agenda del Hospital:** hoy (de 8 a 20), en 2 días, en 3 días y **en 12 días**, que queda después de las dos fechas límite.
- **Un pedido viejo** del Hospital a la Clínica que nadie contestó: ya pasó a **expirado**.

**Para tener varias sesiones a la vez:** usá una ventana normal para el Hospital, una privada (InPrivate o incógnito) para el Banco o la Clínica, y otro navegador para los donantes. Si no, cerrá sesión y entrá con otro usuario.

**Orden recomendado:** paso 0, escenarios 1, 2 y 3, y por último el escenario 4.

### Paso 0: funcionalidad 15, la primera mirada (antes de tocar nada)

1. **Hospital → pestaña "📊 Stock y demanda" → Glóbulos rojos.** Arriba dice "1 grupo crítico".
2. **O−: "Crítico".** Al tocarlo se ve el detalle:
   - 1 disponible y 3 pedidas en necesidades abiertas;
   - el aviso "Faltan 2… habría que citar unas **4 personas**", que es un estimado porque todavía no hay historial;
   - debajo, "¿Quién de la red tiene O−?", con el Banco y la Clínica.

   **No pidas nada acá**, porque eso se hace en el escenario 1.
3. **A+: "Atención", 4 días.** Tiene 2 disponibles y se usan 0,5 por día.
4. **B+: "Cubierto", 30 días.** Muestra dos avisos amarillos: "2 por vencer: conviene usarlas primero" y "Al ritmo de uso actual, 1 se vencerían antes de usarse…". El cuadro no cuenta esa unidad para la cobertura.
5. **El resto de los grupos:** "Sin stock".
6. **El gráfico:** tocar una barra abre el mismo detalle.
7. **Pestaña Plaquetas:** A+ aparece "Crítico" por la necesidad 2. **Tampoco pidas desde acá**, porque eso se hace en el escenario 2.

### Escenario 1: funcionalidades 12, 13 y 14 juntas (necesidad 1)

1. **Hospital → Necesidades.** La de O− dice "0 de 3" y tiene la casilla "mantenerla abierta…". **Dejala sin marcar.**
2. **Funcionalidad 12:** "Convocar donantes" → "Buscar en la red". Tiene que decir que la red puede cubrir **3 de 3**:
   - primero el Banco, el más cercano, con **2 sugeridas**: la tercera se queda por su stock mínimo y la vencida no aparece;
   - después la Clínica, con 1.

   Tocá **Cancelar**.
3. **Hospital → Agenda y turnos.** En Ana: "✓ Donó" → "Registrar donación". La necesidad queda en **1 de 3**.
4. **Hospital → Necesidades → Convocar donantes → Buscar en la red.** Ahora faltan 2: el Banco sugiere 2 y la Clínica queda como otra opción. Tocá **"Pedir estas 2 unidades"**. La tarjeta muestra "2 en camino".
5. **Hospital → Transferencias.**
   - **El pedido nuevo** dice "Esperando respuesta", es para la necesidad de O− y tiene plazo de 24 h.
   - **El pedido viejo** dice "Expiró sin respuesta".
   - **Opcional:** en "Pedir unidades a otra institución", buscá O− glóbulos rojos. Las 2 que ya pediste no aparecen.
6. **Banco → Transferencias.** "Tenés 1 pedido para responder" → **Aceptar** → "Sí, aceptar". En el **Stock** del Banco, esas 2 figuran como "Reservada" y sin el botón "Usar"; la vencida dice "Vencida".
7. **Hospital → Transferencias.** "Confirmar recepción" → "Sí, llegaron". El mensaje dice "…y la necesidad quedó cubierta".
8. **Comprobá la funcionalidad 14:**
   - **La tarjeta** dice **"Cubierta" 3 de 3** y "✓ Se cubrió con donantes y transferencias de otros hospitales". También dice "Convocatoria cerrada: le avisamos a 1 persona…".
   - **En Mailpit (http://localhost:8025)**, a **carla@prueba.test** le llegó **un solo** "¡Gracias! Ya no hace falta que vayas…". A Ana y a Bruno no les llegó.
   - **Carla**, en Mis alertas, ve "Ya no hace falta" con el agradecimiento y sin botones.
   - **En "Stock y demanda"**, O− pasa a **Cubierto** (4 disponibles y 0 pedidas).
9. **Los turnos.** En la tarjeta: "Pedir que reprogramen" → "Sí, avisarles".
   - **En Mailpit**, a **bruno@prueba.test** le llega "…te pide cambiar el día de tu turno".
   - **Bruno** ve el aviso amarillo → "Elegir otro día" → elige la franja **de dentro de 12 días**, que queda después de la fecha límite → "Cambiamos tu turno".
10. **El historial (funcionalidad 13).** En el Stock del Hospital, abrí una de las unidades que llegaron. Dice "Llegó por una transferencia de Banco de Sangre Regional" y su recorrido es Ingreso → Reserva → Transferencia.

### Escenario 2: mantener la convocatoria abierta (necesidad 2)

1. **Hospital:** en la tarjeta de A+ plaquetas, **marcá la casilla**. Aparece un aviso que lo confirma.
2. **Hospital:** "Convocar donantes" → "Buscar en la red" → "Pedir estas 2 unidades".
3. **El Banco acepta** y **el Hospital confirma la recepción**.
4. **La tarjeta** dice "Cubierta" y "Se cubrió con transferencias…", y también "📣 Convocatoria abierta para reponer stock". En Mailpit **no hay nada** para Diego ni para Elena.
5. **Diego** todavía puede tocar "Voy a donar" y reservar en la franja de dentro de 2 o de 3 días.
6. **Hospital:** "Cerrar la convocatoria" → "Sí, cerrar y agradecer". Le llega el agradecimiento a **elena@prueba.test** y **no** a Diego, porque él tiene turno.
7. **Hospital:** "Mantener el turno" → "Sí, mantener". Diego ve que su turno sigue en pie.

### Escenario 3: transferencias a mano (funcionalidad 13)

1. **Hospital → Transferencias → "Pedir unidades a otra institución"**, sin elegir necesidad. Buscá B+ plaquetas, marcá la del Banco y tocá Pedir. La tarjeta dice "pedido a mano".
2. **Banco → Rechazar.** Sin motivo el botón queda desactivado. Escribí un motivo: el Hospital lo ve en "Motivo del rechazo".
3. **Hospital:** pedí a mano la A− glóbulos rojos de la Clínica. **La Clínica acepta** y **el Hospital confirma la recepción**: la unidad entra a su stock.

### Escenario 4: pedir desde el cuadro y la vista del admin (funcionalidad 15)

1. **Hospital → Stock y demanda → A+, que está en "Atención".** En "¿Quién de la red tiene A+?", poné **2** en "Cuántas pedir". En el Banco de Sangre Regional tocá **"Pedir 2"**. Aparece el aviso "Le pediste 2 A+ a Banco de Sangre Regional. Queda pendiente hasta que acepte".
2. **El Banco acepta** (Transferencias) y **el Hospital confirma la recepción.**
3. **Hospital → Stock y demanda:** A+ pasa a **"Cubierto"**, con 4 disponibles y **8 días**.
4. **Entrá con `admin@prueba.test`.** Abajo del panel está **"Stock y demanda de la red"**, que suma todas las instituciones. Al tocar un grupo se ve el detalle, pero **no** aparece "¿Quién de la red tiene…?", porque el admin no pide transferencias.

### Volver a empezar

Desde la raíz del repo, corré `node api/scripts/preparar-prueba-75.js`. Borra y recrea los datos de prueba en la base `donavida_prueba75`; la API de prueba puede seguir corriendo. Después volvé a entrar en cada sesión.

Conviene correrlo el mismo día de la prueba, porque las fechas, los vencimientos y el consumo de 30 días se calculan desde hoy.

### Si algo no responde

- **Los servidores** corren en segundo plano dentro de la sesión de Claude: si la cerrás, se apagan. Para levantarlos a mano, abrí dos terminales:
  - en la raíz del repo, `node api/scripts/api-prueba-75.js`;
  - en `web/`, `npm run dev`.
- **Si al entrar dice que el usuario o la clave no son válidos**, la API que está corriendo es la de siempre (`npm run dev`) y no la de prueba.
- **Si ves un error de conexión momentáneo**, recargá la página.

### Cuando termines

- **Tu API de siempre:** cerrá la de prueba y levantá la de siempre con `npm run dev` en `api/`. Vuelve a tu base `donavida`, que quedó igual.
- **La base de prueba:** si la querés borrar, corré `docker compose exec db dropdb -U donavida donavida_prueba75`.
