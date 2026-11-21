# GitPulse Studio

**Publicador y sincronizador automático de aplicaciones hacia repositorios públicos de GitHub**, con **Dashboard Web**, **CLI global** y **Skill nativo de Antigravity**.

## Características Principales

- **Creación Automática de Repositorios Públicos**: Si tu app es nueva y no tiene remoto en GitHub, GitPulse inicializa Git, crea el repositorio público en tu cuenta y realiza el primer push.
- **`.gitignore` Inteligente por Stack**: Detecta automáticamente Next.js, Node.js, Python, Flutter, Rust o proyectos estáticos y excluye `node_modules/`, `.next/`, `.venv/`, bases de datos y archivos `.env`.
- **Escáner Preventivo de Secretos (`Zero-Leak Guard`)**: Antes de subir código a un repo público, analiza los archivos modificados/nuevos en busca de `.env` expuestos, claves Gemini, OpenAI, GitHub, AWS o llaves privadas. También desindexa `.env` si fue añadido por error anteriormente.
- **Commits Semánticos Automáticos**: Analiza `git diff` y genera mensajes en formato Conventional Commits usando Gemini (`gemini-2.5-flash`) si hay `GEMINI_API_KEY`, o mediante un motor heurístico offline sin costo.
- **Soporte de Ramas y Tags de Versión**: Permite especificar ramas (`-b`) y crear/publicar tags anotados (`-t v1.0.0`).
- **Descubrimiento Automático de `git.exe`**: Localiza automáticamente `git.exe` incluso si solo tienes GitHub Desktop instalado.

---

## 1. Iniciar el Dashboard Web

En `d:\Antigravity\CREADOR\gitpulse-studio`:

```powershell
npm.cmd run dev
```

Abre en tu navegador: **http://localhost:3050**

---

## 2. Uso desde Terminal (CLI)

Puedes ejecutar `gitpulse.cmd` desde cualquier carpeta de tus proyectos:

```powershell
# Subir o actualizar la app de la carpeta actual
d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd sync

# Subir una app específica con mensaje o tag
d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd sync "D:\Antigravity\MI-APP" -m "agrega módulo de pagos" -t v1.0.0

# Ver estado de todas las apps en D:\Antigravity
d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd status "D:\Antigravity"

# Sincronizar todas las apps pendientes en D:\Antigravity
d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd sync-all

# Guardar Token de GitHub (scope: repo)
d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd auth --token TU_TOKEN_GITHUB

# Ejecutar diagnóstico completo
d:\Antigravity\CREADOR\gitpulse-studio\gitpulse.cmd doctor
```

---

## 3. Uso por Chat en Antigravity (Skill `github-autosync`)

El Skill se instala automáticamente en `C:\Users\Usuario\.gemini\antigravity\skills\github-autosync\SKILL.md` mediante:

```powershell
npm.cmd run install:skill
```

Luego, en cualquier proyecto dentro de Antigravity, simplemente escribe:
- *"Sube esta app a GitHub"*
- *"Actualiza el repo en GitHub"*
- *"Sube los cambios con versión v1.0.0"*
- *"Sincroniza todas las apps pendientes a GitHub"*
