# Formato de la copia de seguridad de un grupo

Bote exporta cada grupo como un archivo **JSON** (*Editar grupo → Exportar → Copia de seguridad*)
y lo puede volver a importar (*pantalla principal → Importar*).

- Nombre del archivo: `bote-<nombre-del-grupo>-<AAAA-MM-DD>.json`, por ejemplo
  `bote-viaje-a-lisboa-2026-11-27.json`.
- Codificación: UTF-8. El archivo se escribe con sangría de 2 espacios.
- Código: [`src/lib/backup.ts`](../src/lib/backup.ts) (`buildBackup`, `parseBackup`, `planImport`).
  Si cambias el formato, actualiza también este documento y los tests.

## Estructura general

```jsonc
{
  "format": "bote-group-backup",   // siempre este texto
  "version": 1,                     // versión del formato (ver «Versiones»)
  "exportedAt": "2026-11-27T10:00:00.000Z",  // cuándo se exportó (ISO 8601, UTC)
  "group": { … }                    // el grupo
}
```

### `group`

| Campo | Tipo | Descripción |
|---|---|---|
| `name` | texto (1–100) | Nombre del grupo. |
| `emoji` | texto o `null` | Emoji del grupo. `null` = sin emoji (la app muestra 👥). |
| `currency` | texto (3 letras) | Moneda ISO 4217: `"EUR"`, `"USD"`, `"GBP"`… |
| `type` | `"expenses"` \| `"loan"` | Gastos compartidos o préstamo. |
| `members` | lista de [participantes](#participante) | Al menos uno. |
| `categories` | lista de [categorías propias](#categoría-propia) | Las predefinidas no se incluyen. |
| `expenses` | lista de [movimientos](#movimiento) | Gastos, ingresos y reembolsos. |
| `recurring` | lista de [pagos recurrentes](#pago-recurrente) | Reglas mensuales. |

No se exporta nada personal de quien exporta: ni el código de invitación, ni quién creó el grupo, ni
«¿quién eres?», ni si está archivado o silenciado.

### Participante

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | texto | Identificador. Solo tiene que ser único dentro del archivo. |
| `name` | texto (1–60) | Nombre. |
| `color` | texto o `null` | Color en hexadecimal (`"#C92A2A"`). `null` = color automático. |

### Categoría propia

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | texto | Identificador, referenciado desde `category` de los movimientos. |
| `emoji` | texto (1–16) | Emoji. |
| `name` | texto (1–40) | Nombre. |

Las categorías **predefinidas** se referencian por un id fijo que no cambia nunca:
`food` 🍽️, `groceries` 🛒, `transport` 🚗, `lodging` 🏠, `drinks` 🍻, `leisure` 🎉, `tickets` 🎟️,
`shopping` 🛍️, `health` 💊, `other` 📦 (ver [`src/lib/categories.ts`](../src/lib/categories.ts)).

### Movimiento

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | texto | Identificador. |
| `kind` | `"expense"` \| `"income"` \| `"transfer"` | Ver tabla de tipos. |
| `title` | texto (1–200) | Concepto. |
| `amount` | entero > 0 | Importe **en céntimos**: `4550` = 45,50 €. |
| `paidBy` | id de participante | Quién pagó (gasto), quién lo recibió (ingreso) o quién devuelve (reembolso). Con varios pagadores, el que más pagó. |
| `splitAmong` | lista de ids de participante | Para quién es: quienes comparten el gasto o el ingreso, o quien recibe el reembolso (uno solo). |
| `splitMode` | `"equal"` \| `"shares"` \| `"amounts"` (opcional) | Cómo se reparte. Si falta, `"equal"`. |
| `splitValues` | objeto `{ idParticipante: entero }` o `null` | Partes (`"shares"`) o céntimos de cada uno (`"amounts"`). `null` con `"equal"`. |
| `payers` | objeto `{ idParticipante: céntimos }` o `null` | Solo si pagaron varios: cuánto pagó cada uno. `null` = `paidBy` pagó todo. |
| `date` | texto ISO 8601 | Fecha del movimiento. La app guarda las 12:00 hora local para que no cambie de día. |
| `category` | texto o `null` | Id de categoría (predefinida o propia). `null` en reembolsos y sin categoría. |
| `recurringId` | texto o `null` (opcional) | Si lo creó un pago recurrente, el `id` de esa regla. |

Tipos de movimiento:

| `kind` | Qué es | `paidBy` | `splitAmong` |
|---|---|---|---|
| `expense` | Gasto compartido | Quién pagó | Entre quiénes se reparte |
| `income` | Dinero que entra desde fuera (p. ej. un Bizum de alguien ajeno al grupo) | Quién lo recibió | De quiénes es ese dinero |
| `transfer` | Reembolso entre dos personas | Quién devuelve | Quién recibe (una persona) |

Reparto (`splitMode`):

| Modo | `splitValues` | Ejemplo |
|---|---|---|
| `equal` | `null` | A partes iguales entre `splitAmong`. |
| `shares` | Partes enteras ≥ 0 | `{"ana": 2, "beto": 1}`: Ana paga el doble que Beto. |
| `amounts` | Céntimos de cada uno; **deben sumar `amount`** | `{"ana": 1000, "beto": 4000}`. |

### Pago recurrente

Los mismos campos que un [movimiento](#movimiento) **excepto** `date` y `recurringId`, más:

| Campo | Tipo | Descripción |
|---|---|---|
| `dayOfMonth` | entero 1–31 | Día del mes. En meses más cortos, el último día. |
| `nextDate` | texto `AAAA-MM-DD` | Próxima fecha en que se creará. |
| `active` | booleano | Si estaba activo al exportar. |
| `lastError` | texto o `null` (opcional) | Motivo si el servidor lo pausó. |

## Qué comprueba la app al importar

`parseBackup` rechaza el archivo, con un mensaje que indica el problema, si:

- No es JSON, o `format` no es `"bote-group-backup"`.
- `version` no es una versión que esta app sepa leer.
- Falta el nombre, la moneda no tiene 3 letras, el tipo es desconocido o no hay participantes.
- Hay participantes repetidos o sin nombre, o categorías incompletas.
- Algún movimiento o pago recurrente:
  - tiene un tipo, importe (no entero o ≤ 0) o fecha no válidos;
  - hace referencia a un participante que no está en `members` (en `paidBy`, `splitAmong`,
    `payers` o `splitValues`);
  - no cuadra: `payers` o los importes de `amounts` no suman `amount`, o todas las partes son 0.

La base de datos vuelve a comprobar todo esto al guardar, así que un archivo editado a mano no puede
dejar un grupo descuadrado.

## Qué hace la app al importar

`planImport` crea **siempre un grupo nuevo**:

- **Todos los ids son nuevos** (participantes, categorías propias, movimientos, reglas), y se actualizan
  todas las referencias. Por eso los ids del archivo solo tienen que ser coherentes entre sí, y se puede
  importar el mismo archivo varias veces.
- Los **pagos recurrentes se importan pausados** (`active: false`), para que no empiecen a crear gastos
  solos. Se reanudan desde *Editar grupo → Pagos recurrentes*.
- Quien importa queda como **creador** del grupo y único miembro. Para que entren los demás, se les
  invita con el código o el enlace, como en cualquier grupo.
- Es todo o nada: si falla algún paso, el grupo a medias se borra.

## Versiones

- `version` es `1`. Cualquier cambio que haga que una versión anterior de la app no pueda leer el archivo
  sube este número.
- Añadir un campo **opcional** no cambia la versión: las versiones anteriores lo ignoran.
- Una app que encuentra una versión mayor que la suya rechaza el archivo y pide actualizar.

## Ejemplo completo

```json
{
  "format": "bote-group-backup",
  "version": 1,
  "exportedAt": "2026-11-27T10:00:00.000Z",
  "group": {
    "name": "Piso",
    "emoji": "🏠",
    "currency": "EUR",
    "type": "expenses",
    "members": [
      { "id": "ana", "name": "Ana", "color": "#C92A2A" },
      { "id": "beto", "name": "Beto", "color": null }
    ],
    "categories": [
      { "id": "c-limpieza", "emoji": "🧽", "name": "Limpieza" }
    ],
    "expenses": [
      {
        "id": "e1",
        "kind": "expense",
        "title": "Súper",
        "amount": 6000,
        "paidBy": "ana",
        "splitAmong": ["ana", "beto"],
        "splitMode": "equal",
        "splitValues": null,
        "payers": null,
        "date": "2026-11-02T11:00:00.000Z",
        "category": "groceries",
        "recurringId": null
      },
      {
        "id": "e2",
        "kind": "expense",
        "title": "Productos de limpieza",
        "amount": 3000,
        "paidBy": "beto",
        "splitAmong": ["ana", "beto"],
        "splitMode": "shares",
        "splitValues": { "ana": 2, "beto": 1 },
        "payers": null,
        "date": "2026-11-05T11:00:00.000Z",
        "category": "c-limpieza",
        "recurringId": null
      },
      {
        "id": "e3",
        "kind": "income",
        "title": "Bizum de Carlos",
        "amount": 5000,
        "paidBy": "ana",
        "splitAmong": ["beto"],
        "splitMode": "equal",
        "splitValues": null,
        "payers": null,
        "date": "2026-11-10T11:00:00.000Z",
        "category": null,
        "recurringId": null
      },
      {
        "id": "e4",
        "kind": "expense",
        "title": "Alquiler",
        "amount": 80000,
        "paidBy": "ana",
        "splitAmong": ["ana", "beto"],
        "splitMode": "equal",
        "splitValues": null,
        "payers": null,
        "date": "2026-11-01T11:00:00.000Z",
        "category": "lodging",
        "recurringId": "r1"
      },
      {
        "id": "e5",
        "kind": "transfer",
        "title": "Reembolso a Ana",
        "amount": 2000,
        "paidBy": "beto",
        "splitAmong": ["ana"],
        "splitMode": "equal",
        "splitValues": null,
        "payers": null,
        "date": "2026-11-20T11:00:00.000Z",
        "category": null,
        "recurringId": null
      }
    ],
    "recurring": [
      {
        "id": "r1",
        "kind": "expense",
        "title": "Alquiler",
        "amount": 80000,
        "paidBy": "ana",
        "splitAmong": ["ana", "beto"],
        "splitMode": "equal",
        "splitValues": null,
        "payers": null,
        "category": "lodging",
        "dayOfMonth": 1,
        "nextDate": "2026-12-01",
        "active": true,
        "lastError": null
      }
    ]
  }
}
```
