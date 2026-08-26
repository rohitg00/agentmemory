# agentmemory-portable — kit USB (vive dentro il repo agentmemory)

Avvia agentmemory da pen drive / cartella locale **senza patchare** i sorgenti
upstream. Questa cartella fa parte del progetto e si puo pushare su git.

Il kit e un wrapper del CLI ufficiale (v0.9.29+): SQLite in `data\` tramite
`AGENTMEMORY_DATA_DIR`, config engine = `iii-config.yaml` del repo padre.

## Posizione

```
agentmemory/
  agentmemory-portable/     <-- questo kit
  src/ ...
  package.json
```

In layout **in-tree** (default qui) il codice e la cartella padre del kit:
non serve un secondo clone in `repo\`.

## Layout

```
agentmemory-portable\
  setup.cmd / start.cmd / start-clean.cmd / stop.cmd / status.cmd / update.cmd
  pack-usb.cmd / verify-usb.cmd
  mcp-launch.cmd
  mcp-cursor.example.json
  kit.config.ps1
  data\                    # state_store.db + stream_store + iii-config.runtime.yaml
  scripts\
  portable\node\           # Node portatile (non in git)
  portable\iii.exe         # backup (non in git)
  home\.agentmemory\       # .env, pid, preferences (runtime, non in git)
  home\cache\
  downloads\               # zip temporanei (non in git)
```

## Prerequisiti

- Windows 10/11 x64
- `git` sul PATH (setup/update)
- Porte libere: **3111**, **3112**, **3113**, **49134**
- USB 3.x consigliata se usi una pen drive

## Prima installazione

1. Dal clone del progetto: entra in `agentmemory-portable\`
2. Doppio-click **`setup.cmd`** (serve rete: Node + iii.exe + npm install/build)
3. Avvia con **`start.cmd`**

Su pen drive: copia l'intero repo `agentmemory` (o almeno questa cartella + build),
poi `setup.cmd` / `start.cmd`.

## Uso quotidiano

| Comando | Effetto |
|--------|---------|
| `start.cmd` | Remappa home su `home\`, avvia daemon nativo (dati in `data\`). Non usa Docker. Se le porte sono occupate esce con incompatibilità |
| `start-clean.cmd` | Alias di `start.cmd` (pulisce i pid residui del kit, non tocca Docker) |
| `stop.cmd` | Ferma worker + iii-engine |
| `status.cmd` | `agentmemory status` |
| `update.cmd` | `git pull` sul repo padre + `npm install` + build |
| `pack-usb.cmd` | Impacchetta `out\agentmemory-usb\` (runtime-only) da copiare sulla pendrive |
| `verify-usb.cmd` | Verifica SHA256 di `MANIFEST.json` (dopo pack o dopo copia USB) |

## Pack USB (runtime-only)

Sul **PC di sviluppo** (kit gia setupato: Node + iii presenti; serve rete per `npm install`):

```powershell
cd agentmemory-portable
.\pack-usb.cmd -Force
```

Opzioni: `-Rebuild` (ricompila dist), `-Zip`, `-IncludeSourceMaps`, `-OutputDir <path>`.

Output: `agentmemory-portable\out\agentmemory-usb\` — copiala intera sulla pendrive. Sul PC di destinazione **non** serve `setup.cmd`.

Avvio sulla USB:

```text
E:\agentmemory-usb\agentmemory-portable\start.cmd
```

Dopo la copia, verifica integrita:

```text
E:\agentmemory-usb\agentmemory-portable\verify-usb.cmd
```

Il pacchetto v1 e **USB vergine** (nessuna memoria del PC di pack) e **senza src/.git**: `update.cmd` non e supportato. Per aggiornare, rifai `pack-usb` e ricopia.

v2 (non implementato): `-Profile Updatable` (src + git, `update.cmd` sulla USB) e `-IncludeData` (copia `data\` / `home\` attuali, con warning sulle API key).

## Dati sulla pen drive / kit

| Dato | Dove |
|------|------|
| SQLite + stream + runtime yaml | `agentmemory-portable\data\` (`AGENTMEMORY_DATA_DIR`) |
| Config / pid / snapshot / export | `home\.agentmemory\` |
| Cache embedding | `home\cache\` |
| Codice + `iii-config.yaml` bundled | repo padre (`..`) |

Un avvio fresco **senza** `AGENTMEMORY_DATA_DIR` (CLI nudo) su Windows scriverebbe in
`%APPDATA%\agentmemory`. Gli script del kit impostano sempre la data dir su `data\`.

## Porte e Docker

Il kit **non usa Docker**, anche se Docker Desktop e installato. `AGENTMEMORY_USE_DOCKER=0` e i dati restano in `data\` sulla pen drive.

Porte fisse: **3111**, **3112**, **3113**, **49134**. Prima dell'avvio lo script ferma solo processi residui **di questo kit**, poi controlla le porte. Se sono ancora occupate (altro agentmemory, Docker, altro servizio) esce con **incompatibilità porte** e non si aggancia all'engine gia in ascolto. Libera le porte e rilancia `start.cmd`.

## MCP Cursor

Il file `mcp.json` di Cursor va nel profilo **host**
(`%USERPROFILE%\.cursor\mcp.json`), non sotto `home\` del kit.

Con daemon avviato, due ricette:

**1. Launcher del kit** (Node portatile, senza npx sul host) — vedi `mcp-cursor.example.json`:

```json
"agentmemory": {
  "command": "C:\\path\\to\\agentmemory\\agentmemory-portable\\mcp-launch.cmd",
  "args": [],
  "env": { "AGENTMEMORY_URL": "http://127.0.0.1:3111" }
}
```

Sostituisci il path con la lettera unita / percorso reale del kit.

**2. npx sul host** (usa il Node di sistema):

```json
"agentmemory": {
  "command": "npx",
  "args": ["-y", "@agentmemory/mcp"],
  "env": { "AGENTMEMORY_URL": "http://127.0.0.1:3111" }
}
```

## Cosa viene committato

Si pushano script, `*.cmd`, README, esempi MCP.

**Non** finiscono in git (vedi `.gitignore`): `portable/node`, `downloads`,
`data/*`, `home/**` runtime, `.env`, `out/`.
