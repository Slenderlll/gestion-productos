# Conecta la app a MongoDB Atlas sin escribir la cadena de conexión en ningún archivo:
# 1. pide la URI de Atlas (no se muestra en pantalla),
# 2. le pone la base "gestion_productos",
# 3. la guarda en Vercel (Production) como MONGODB_URI,
# 4. crea el administrador y los productos de ejemplo en Atlas (npm run seed).
# Uso, desde la carpeta del proyecto:  & .\scripts\configurar-atlas.ps1

$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)

$seguro = Read-Host 'Pega la URI de Atlas (mongodb+srv://usuario:clave@cluster...)' -AsSecureString
$uri = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)).Trim()

if ($uri -notmatch '^mongodb(\+srv)?://[^/\s]+') {
  Write-Host 'Eso no parece una URI de MongoDB. No se cambió nada.' -ForegroundColor Red
  exit 1
}
if ($uri -match '<password>|<db_password>') {
  Write-Host 'La URI todavía tiene <password>: reemplázalo por la contraseña real del usuario de Atlas.' -ForegroundColor Red
  exit 1
}

# Misma URI pero con la base gestion_productos (no toca la base de finca-lotes)
$uri = $uri -replace '^(mongodb(\+srv)?://[^/?]+)(/[^?]*)?', '$1/gestion_productos'

Write-Host 'Guardando MONGODB_URI en Vercel (Production)...'
$uri | npx --yes vercel@65.17.0 env add MONGODB_URI production --force
if ($LASTEXITCODE -ne 0) { Write-Host 'No se pudo guardar en Vercel.' -ForegroundColor Red; exit 1 }

Write-Host 'Creando el administrador y los productos de ejemplo en Atlas...'
$env:MONGODB_URI = $uri
try {
  npm run seed
  if ($LASTEXITCODE -ne 0) { throw 'El seed falló: revisa usuario, contraseña y que Atlas permita el acceso desde 0.0.0.0/0.' }
} finally {
  Remove-Item Env:MONGODB_URI -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Listo. La contraseña del administrador está en ADMIN_PASSWORD de tu archivo .env.' -ForegroundColor Green
