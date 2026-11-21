# REGLA GLOBAL OBLIGATORIA: PUBLICACIÓN Y SINCRONIZACIÓN CON GITHUB (GITPULSE STUDIO)

Cuando el usuario pida **subir, publicar, respaldar o actualizar código en GitHub** (ej. *"sube esta app a github"*, *"actualiza el repo"*, *"haz push"*, *"sube los cambios"*, *"publica versión v1.0"*):

## Prohibiciones Estrictas
1. **NO** uses `gh` CLI ni digas que falta instalar `gh`.
2. **NO** le pidas al usuario que cree el repositorio vacío manualmente en GitHub ni que use GitHub Desktop manualmente.
3. **NO** ejecutes `git init`, `git add`, `git commit` o `git push` a mano por separado en reemplazo de GitPulse.

## Acción Obligatoria
Usa **GitPulse Studio**, que ya está instalado y autenticado en este equipo para crear repositorios públicos en automático, blindar `.gitignore` y secretos, redactar el commit semántico y hacer `push`:

```powershell
# Subir proyecto nuevo (crea el repo público automáticamente) o actualizar cambios:
& "d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd" sync "<RUTA_ABSOLUTA_DEL_PROYECTO>"
```

### Opciones Adicionales
- Con nota de commit personalizada: `... sync "<RUTA>" -m "descripción"`
- Con rama o tag de versión: `... sync "<RUTA>" -b "<rama>" -t "v1.0.0"`
- Sincronizar todas las apps pendientes en `D:\Antigravity`: `& "d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd" sync-all`
- Ver estado / diagnóstico: `... status "<RUTA>"` o `... doctor`

Si GitPulse reporta `BLOCKED_SECRET` por una clave API o `.env` expuesto, detente, informa los archivos exactos al usuario y **no** pases `--force` sin su confirmación explícita.
