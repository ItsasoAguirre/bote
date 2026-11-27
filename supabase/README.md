# Entornos y base de datos

La app tiene tres entornos. Se elige con `EXPO_PUBLIC_APP_ENV`, que ya ponen los comandos de `npm`
y los perfiles de `eas.json`. Las URLs y claves de cada uno están en `src/config/environments.json`.

| Entorno | Supabase | Cómo arrancar la app | Nombre de la app |
|---|---|---|---|
| **local** | En tu ordenador (Docker) | `npm run start:local` | Bote (local) |
| **dev** | Proyecto **Bote** (`odejhmtdjyobdrhrjcto`) | `npm start` | Bote (dev) |
| **prod** | Proyecto **Bote prod** (`oyecndefjtquntlbvkid`) | `npm run start:prod` (con cuidado: datos reales) | Bote |

Fuera de prod, el título de la pantalla principal indica el entorno («Mis grupos · DEV»).
Cada entorno guarda sus datos en el móvil por separado, así que no se mezclan al cambiar.

Compilaciones con EAS (`eas.json`):

| Perfil | Entorno | Qué genera | Identificador |
|---|---|---|---|
| `preview` | dev | APK para pruebas | `com.kresala.bote.dev` |
| `production-apk` | prod | APK para instalar directamente | `com.kresala.bote` |
| `production` | prod | AAB para Google Play | `com.kresala.bote` |

Ejemplo: `npx eas-cli@latest build -p android --profile production-apk`.

## Local

Requiere **Docker Desktop** instalado y abierto.

```bash
npm run db:start     # arranca Supabase en local y aplica supabase/migrations/
npm run start:local  # arranca la app contra el Supabase local
npm run db:status    # URLs y claves locales (Studio: http://localhost:54323)
npm run db:reset     # borra los datos locales y vuelve a aplicar las migraciones
npm run db:stop      # lo para
```

- El móvil tiene que estar en la misma wifi que el ordenador. La app usa la IP de tu wifi
  (la detecta `app.config.ts`). Si no conecta, fíjala en `.env.local`:
  `LOCAL_SUPABASE_URL=http://TU-IP:54321`.
- Si `npm run db:status` muestra una *anon key* distinta de la de `app.config.ts`,
  ponla en `.env.local` como `LOCAL_SUPABASE_KEY=...`.
- La configuración local está en `config.toml` (acceso anónimo activado, como en la nube).

## Migraciones: cómo cambiar la base de datos

Todas las estructuras de la base de datos salen de `supabase/migrations/`, en orden:

- `20261123221340_baseline.sql`: el esquema completo de partida. **No se edita nunca.**
- `20261123221400_explicit_privileges.sql`: permisos explícitos, independientes de los valores
  por defecto de cada proyecto (los proyectos nuevos de Supabase no traen todos los mismos).
- Los cambios futuros van en archivos **nuevos**: `npm run db:new nombre_del_cambio`.

Flujo para un cambio:

1. Crea la migración (`npm run db:new ...`) y escríbela.
2. Pruébala en **local**: `npm run db:reset`.
3. Aplícala en **dev** y prueba la app con `npm start`.
4. Aplícala en **prod**.

Para aplicar en dev/prod con la CLI hay que enlazar el proyecto una vez
(`npx supabase login`, `npx supabase link --project-ref <ref>`) y luego `npx supabase db push`.
El historial de migraciones de dev y prod coincide con estos archivos.

`supabase/history/` guarda, solo como registro, las migraciones paso a paso que llevaron a la
base. No se aplican.

## Comprobar que dos entornos son iguales

`supabase/checks/schema_fingerprint.sql` saca una huella de columnas, restricciones, índices,
reglas de acceso (RLS), permisos, funciones, tiempo real, tarea programada e historial.
Ejecútalo en cada proyecto: si los hashes coinciden, el esquema es idéntico.

## Ajustes del panel que no están en las migraciones

En **cada proyecto en la nube**, en *Authentication → Sign In / Providers*:
**Allow anonymous sign-ins** activado. Sin esto la app no puede entrar.

## Cómo funciona el acceso

- Cada móvil inicia sesión de forma anónima y recibe un identificador de usuario.
- Un móvil solo ve un grupo si lo ha creado o si ha entrado con su **código de invitación**.
  Esto lo garantizan las reglas *Row Level Security*, no la app.
- «¿Quién eres?» se guarda solo en el móvil.
- Los pagos recurrentes los crea una tarea programada (`pg_cron`) cada hora, en el servidor.
