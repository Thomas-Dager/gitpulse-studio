---
name: github-autosync
description: Automatiza la subida, creación de repositorio público en GitHub, actualización de cambios (commits semánticos), protección de secretos (.env/API keys), ramas y tags de versión cuando el usuario pide subir o actualizar el código de una app en GitHub.
---

# GitHub AutoSync (GitPulse Studio)

Usa esta habilidad inmediatamente cuando el usuario pida subir, publicar, respaldar o actualizar código en GitHub (por ejemplo: *"sube esta app a github"*, *"actualiza el repo"*, *"haz push de los cambios"*, *"publica versión v1.0"*, *"sincroniza con github"*).

## Reglas de Ejecución (Windows / PowerShell)

1. **Binario CLI**: Ejecuta el comando usando `d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd` (NO uses `npm` o `npx` sin `.cmd` en PowerShell porque la ExecutionPolicy del sistema bloquea `.ps1`).
2. **Identifica la ruta del proyecto activo**: Usa la ruta absoluta del workspace actual (o la carpeta de la app que el usuario indicó). Si el usuario pide sincronizar todas las apps pendientes, usa `sync-all`.

## Comandos Disponibles

- **Subir o actualizar la app actual en GitHub (crea el repo público automáticamente si es nuevo):**
  ```powershell
  & "d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd" sync "<RUTA_ABSOLUTA_DEL_PROYECTO>"
  ```
- **Con mensaje de commit personalizado:**
  ```powershell
  & "d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd" sync "<RUTA_PROYECTO>" -m "Descripción del cambio"
  ```
- **Creando o cambiando a una rama específica y/o etiquetando una versión:**
  ```powershell
  & "d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd" sync "<RUTA_PROYECTO>" -b "<rama>" -t "v1.0.0"
  ```
- **Sincronizar todas las apps con cambios pendientes en `D:\Antigravity`:**
  ```powershell
  & "d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd" sync-all
  ```
- **Consultar estado antes de subir:**
  ```powershell
  & "d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd" status "<RUTA_PROYECTO>"
  ```
- **Verificar salud de Git, Token y Skill:**
  ```powershell
  & "d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd" doctor
  ```

## Manejo de Respuesta al Usuario

1. **Si la sincronización tuvo éxito**: Informa al usuario de forma concisa:
   - Enlace público del repositorio en GitHub.
   - Rama y Tag (si se creó).
   - Hash y mensaje del commit generado.
   - Si se creó o actualizó el `.gitignore` o se retiró algún `.env` del índice.
2. **Si fue bloqueado por secretos expuestos (`BLOCKED_SECRET`)**:
   - Muestra exactamente los archivos y líneas reportados por GitPulse.
   - NO fuerces el push (`--force`) por tu cuenta; pide al usuario que mueva las credenciales a `.env` o confirme explícitamente si es un falso positivo.
3. **Si falta el Token de GitHub para crear repositorios nuevos**:
   - Indica al usuario el enlace de creación de token (`https://github.com/settings/tokens/new?scopes=repo&description=GitPulse+Studio`) y que puede guardarlo ejecutando `gitpulse.cmd auth --token TU_TOKEN` o desde Ajustes del Dashboard (`http://localhost:3050`).
