# Bote 💰

App móvil para **repartir gastos en grupo**: viajes, pisos compartidos, cenas… y también para llevar
**préstamos** entre personas. Android e iOS, hecha con [Expo](https://expo.dev) y
[Supabase](https://supabase.com).

## Qué hace

- **Grupos sincronizados**: cada persona usa su móvil; los cambios llegan a todos al momento.
  Sin registro: cada móvil entra de forma anónima y se une a un grupo con un **código** o un
  **enlace de invitación**.
- **Gastos, ingresos y reembolsos**.
  - Repartos **a partes iguales**, **por partes** («Ana cuenta doble») o **por importes**.
  - **Varios pagadores** en un mismo gasto.
  - **Ingresos**: dinero que entra desde fuera, por ejemplo un Bizum que recibe Ana pero es para Beto.
- **Saldos** y **cómo saldar** con el menor número de pagos; saldo global de todos tus grupos.
- **Categorías con emoji** (predefinidas y propias) y **estadísticas**: gráfico por categoría,
  por persona y por mes.
- **Pagos recurrentes** mensuales (alquiler, suscripciones…), creados por el servidor.
- **Préstamos**: quién presta, a quién, cuánto se ha devuelto y cuánto queda.
- **Notificaciones push**: nuevo gasto, «te han pagado», ingresos para ti. Se pueden silenciar por grupo.
- **Exportar**: resumen en **PDF** y **copia de seguridad** que se puede volver a importar
  (formato en [`docs/backup-format.md`](docs/backup-format.md)).
- **Idiomas**: castellano, inglés y euskera. Sigue el idioma del móvil o se elige en la app (🌐); las
  notificaciones llegan en el idioma de cada móvil.
- Archivar y eliminar grupos, colores por persona, emoji de grupo, modo oscuro.

## Tecnología

| | |
|---|---|
| App | Expo SDK 58, React Native 0.88, Expo Router, TypeScript |
| Datos | Supabase: Postgres con Row Level Security, Realtime, `pg_cron`, `pg_net` |
| Notificaciones | `expo-notifications` + servicio de Expo + Firebase Cloud Messaging (Android) |
| Web e invitaciones | EAS Hosting (versión web + Android App Links) |
| Compilación | EAS Build |

## Empezar

Requisitos: Node.js y la app **Expo Go** en el móvil (o un APK de desarrollo).

```bash
npm install
npm start            # entorno dev
```

Escanea el QR con Expo Go (el móvil y el ordenador en la misma wifi; si no,
`npm start -- --tunnel`). Algunas funciones necesitan el APK y no van en Expo Go: las
**notificaciones** en Android y los **enlaces de invitación**.

## Entornos

El entorno se elige con `EXPO_PUBLIC_APP_ENV`, que ya fijan los comandos de `npm` y los perfiles de
`eas.json`. Las URLs y claves públicas de cada uno están en
[`src/config/environments.json`](src/config/environments.json).

| Entorno | Supabase | Arrancar | App | Invitaciones |
|---|---|---|---|---|
| **dev** | Proyecto «Bote» | `npm start` | Bote (dev) · `com.kresala.bote.dev` | `bote--dev.expo.app` |
| **prod** | Proyecto «Bote prod» | `npm run start:prod` ⚠️ datos reales | Bote · `com.kresala.bote` | `bote.expo.app` |
| **local** | Supabase en Docker | `npm run start:local` | Bote (local) | — |

Fuera de prod, la pantalla principal muestra el entorno en el título («Mis grupos · DEV»).

## Comandos

| Comando | Qué hace |
|---|---|
| `npm start` / `start:prod` / `start:local` | Arranca la app en ese entorno |
| `npm run lint` · `npm run typecheck` | Lint y comprobación de tipos |
| `npm run db:start` / `db:stop` / `db:reset` | Supabase local (requiere Docker) |
| `npm run db:new <nombre>` | Crea una migración nueva |

## Base de datos

El esquema está en [`supabase/migrations/`](supabase/migrations). Todo el acceso a los datos lo
controlan las reglas de **Row Level Security**: un móvil solo ve los grupos en los que ha entrado.
Cada cambio va en una migración nueva y se aplica **primero en dev y después en prod**.
Detalles, flujo de trabajo y cómo comprobar que dev y prod coinciden:
[`supabase/README.md`](supabase/README.md).

## Compilar la app (EAS)

| Perfil | Entorno | Genera |
|---|---|---|
| `preview` | dev | APK para pruebas |
| `production-apk` | prod | APK para instalar directamente |
| `production` | prod | AAB para Google Play |

```bash
npx eas-cli@latest build -p android --profile preview          # primero dev…
npx eas-cli@latest build -p android --profile production-apk   # …y prod cuando dev esté aprobado
```

La versión web (para los enlaces de invitación) se publica con `npx expo export -p web` y
`npx eas-cli@latest deploy` (`--alias dev` para dev, `--prod` para prod).

## Estructura

```
src/
  app/          Pantallas (Expo Router)
  components/   Componentes de interfaz y formularios
  lib/          Lógica: saldos, repartos, estadísticas, préstamos, copias, PDF, Supabase…
  store/        Estado y sincronización con Supabase
  config/       Entornos
supabase/       Migraciones, configuración local y comprobaciones
docs/           Documentación (formato de las copias de seguridad)
public/         Archivos de la web (.well-known/assetlinks.json para los App Links)
firebase/       Configuración de Firebase (no secreta)
```

## Contribuir

Ramas (`main` = prod, `develop` = dev, `<tipo>/<descripcion>` para cada cambio) y mensajes de commit
([Conventional Commits](https://www.conventionalcommits.org), en inglés): ver [`CONTRIBUTING.md`](CONTRIBUTING.md).
GitHub Actions revisa cada pull request, publica la web de dev al fusionar en `develop` y, en cada
versión, crea el tag `vX.Y.Z`, la Release y publica la web de prod.

## Licencia

[MIT](LICENSE) © 2026 Itsaso Aguirre
