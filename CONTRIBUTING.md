# Cómo trabajar en Bote

Convenciones de ramas y commits del proyecto. Se comprueban automáticamente con
[husky](https://typicode.github.io/husky/) y [commitlint](https://commitlint.js.org) al hacer commit y
al subir (se activan solos con `npm install`).

## Ramas

| Rama | Para qué | Entorno |
|---|---|---|
| `main` | Lo que está en **producción** | prod: APK `production-apk`, web `bote.expo.app`, Supabase «Bote prod» |
| `develop` | Lo que está en **desarrollo**, listo para probar | dev: APK `preview`, web `bote--dev.expo.app`, Supabase «Bote» |
| `<tipo>/<descripcion>` | Cada cambio | — |

- **Nunca se hacen commits directamente en `main` ni en `develop`**: solo reciben fusiones (el hook
  `pre-commit` lo impide).
- Nombre de rama: `<tipo>/<descripcion-corta>` en minúsculas y con guiones, con el mismo `tipo` que los
  commits. Ejemplos: `feat/incomes`, `fix/web-pdf`, `chore/update-deps`, `docs/backup-format`.
  Además: `hotfix/…` para arreglos urgentes en producción y `release/…` si hace falta preparar una
  versión. El hook `pre-push` comprueba el nombre.

### Flujo normal: primero dev, luego prod

```bash
git switch develop && git pull
git switch -c feat/mi-cambio        # rama desde develop
# … cambios y commits …
git push -u origin feat/mi-cambio   # y abrir un pull request hacia develop
```

1. **Pull request a `develop`**. GitHub Actions pasa los checks (lint, typecheck, commits y título del
   pull request). Se fusiona con **squash**: el título del pull request es el mensaje del commit, así
   que debe seguir las convenciones. Al fusionarlo, se prueba en **dev**:
   - web → se publica sola en `bote--dev.expo.app`;
   - migraciones nuevas de `supabase/migrations/` → aplicarlas en dev a mano;
   - si hay cambios nativos → compilar el APK de dev (`eas build --profile preview`).
2. Cuando dev está **aprobado**, **pull request de `develop` a `main`**, fusionado con **merge
   commit** (no squash, para que cada `feat`/`fix` llegue al CHANGELOG). Ver
   [Publicar una versión](#publicar-una-versión).

### Arreglos urgentes en producción

```bash
git switch -c hotfix/descripcion main
# … arreglo …
# pull request a main y, después, fusionar main en develop para no perder el arreglo
```

## Publicar una versión

Las versiones siguen [SemVer](https://semver.org) y las calcula
[release-please](https://github.com/googleapis/release-please) a partir de los commits que llegan a
`main`: `fix` sube el parche (1.0.0 → 1.0.1), `feat` la versión menor (1.0.0 → 1.1.0) y un
`BREAKING CHANGE` la mayor (1.0.0 → 2.0.0).

1. Al fusionar `develop` en `main`, release-please abre (o actualiza) un pull request
   **«chore(main): release X.Y.Z»** con el `CHANGELOG.md` y la versión nueva en `package.json` y
   `app.json`. Se pueden acumular varios pasos a `main` antes de publicar.
2. Antes de fusionarlo: aplicar en **prod** las migraciones nuevas.
3. Al fusionar ese pull request, GitHub Actions:
   - crea el **tag `vX.Y.Z`** y la **Release** en GitHub con las notas;
   - publica la web en `bote.expo.app`;
   - abre un pull request de `main` a `develop` con el cambio de versión. Fusionarlo con **merge
     commit**.
4. Compilar los APK/AAB de prod (`eas build --profile production-apk` o `production`): ya llevan la
   versión nueva.

Los despliegues usan el secret `EXPO_TOKEN` del repositorio (token de acceso de expo.dev).

## Mensajes de commit

[Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/), **en inglés**:

```
<type>(<scope>): <description>

[cuerpo opcional: qué y por qué]

[pie opcional: BREAKING CHANGE, Co-Authored-By…]
```

- `description` en minúsculas, en imperativo y sin punto final: «add», no «added» ni «adds».
- Máximo 100 caracteres por línea.

### Tipos

| Tipo | Cuándo |
|---|---|
| `feat` | Funcionalidad nueva |
| `fix` | Arreglo de un error |
| `docs` | Solo documentación |
| `refactor` | Cambio de código que no añade ni arregla nada |
| `perf` | Mejora de rendimiento |
| `test` | Tests |
| `build` | Dependencias, configuración de compilación, EAS |
| `ci` | Integración continua |
| `chore` | Tareas de mantenimiento que no tocan la app |
| `style` | Formato (espacios, comas…), sin cambios de comportamiento |
| `revert` | Deshacer un commit anterior |

### Ámbitos (`scope`, opcional)

`expenses`, `incomes`, `groups`, `loans`, `stats`, `export`, `notifications`, `invites`, `recurring`,
`ui`, `db`, `web`, `env`, `build`, `deps`. Se pueden usar otros (commitlint solo avisa); si se repiten,
añádelos a `commitlint.config.mjs`.

### Ejemplos

```
feat(incomes): add incomes received on behalf of other members
fix(web): print the PDF summary from a hidden iframe
feat(db): add trigger that checks expense members belong to the group
docs: document the backup file format
build(deps): add expo-print and expo-sharing
refactor(export): move export handling to a shared hook
```

### Cambios que rompen compatibilidad

Se marcan con `!` y un pie `BREAKING CHANGE:` que explique qué hay que hacer. Por ejemplo, un cambio
del formato de las copias de seguridad que las versiones antiguas no puedan leer:

```
feat(export)!: store amounts per currency in backups

BREAKING CHANGE: backups now use version 2; older app versions can't import them.
```

## Antes de abrir un pull request

```bash
npm run lint
npm run typecheck
```

Si el cambio toca la base de datos: una migración **nueva** en `supabase/migrations/` (nunca editar las
ya aplicadas) y comprobar con `supabase/checks/schema_fingerprint.sql` que dev y prod quedan iguales
tras aplicarla en los dos. Ver [`supabase/README.md`](supabase/README.md).
