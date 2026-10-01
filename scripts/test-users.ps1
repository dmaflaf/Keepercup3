# Script para testear sistema de usuarios en Windows
# USO: powershell -ExecutionPolicy Bypass -File scripts/test-users.ps1 [URL]

param(
    [string]$ApiUrl = "http://localhost:3000"
)

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║     🧪 TESTING - Sistema de Usuarios Keeper Cup 3          ║" -ForegroundColor Blue
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""
Write-Host "API URL: $ApiUrl" -ForegroundColor Yellow
Write-Host ""

$testsPassed = 0
$testsFailed = 0

# ============================================
# 1. CREAR USUARIOS DE PRUEBA
# ============================================
Write-Host "[1/5]" -ForegroundColor Yellow -NoNewline
Write-Host " Creando usuarios de prueba..."
Write-Host "POST $ApiUrl/api/setup/init-admin" -ForegroundColor Gray
Write-Host ""

try {
    $setupResponse = Invoke-WebRequest -Uri "$ApiUrl/api/setup/init-admin" `
        -Method POST `
        -ContentType "application/json" | Select-Object -ExpandProperty Content

    $setupJson = $setupResponse | ConvertFrom-Json
    $setupJson | ConvertTo-Json | Write-Host -ForegroundColor Gray

    if ($setupJson.ok) {
        Write-Host "✅ Usuarios creados exitosamente" -ForegroundColor Green
        $testsPassed++
    }
} catch {
    if ($_ -match "usuarios en la BD") {
        Write-Host "⚠️  Usuarios ya existen (normal)" -ForegroundColor Yellow
        $testsPassed++
    } else {
        Write-Host "❌ Error creando usuarios" -ForegroundColor Red
        Write-Host $_.Exception.Message -ForegroundColor Red
        $testsFailed++
    }
}
Write-Host ""

# ============================================
# 2. LOGIN COMO ADMIN
# ============================================
Write-Host "[2/5]" -ForegroundColor Yellow -NoNewline
Write-Host " Intentando login como ADMIN..."
Write-Host "POST $ApiUrl/api/auth/login" -ForegroundColor Gray
Write-Host "Credenciales: admin@keeper.ec / admin123" -ForegroundColor Gray
Write-Host ""

try {
    $adminLoginBody = @{
        email = "admin@keeper.ec"
        password = "admin123"
    } | ConvertTo-Json

    $adminLoginResponse = Invoke-WebRequest -Uri "$ApiUrl/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $adminLoginBody | Select-Object -ExpandProperty Content

    $adminJson = $adminLoginResponse | ConvertFrom-Json
    $adminJson | ConvertTo-Json | Write-Host -ForegroundColor Gray

    $adminToken = $adminJson.token
    if ($adminToken) {
        Write-Host "✅ Login ADMIN exitoso" -ForegroundColor Green
        Write-Host "Token: $($adminToken.Substring(0, 50))..." -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "❌ No se obtuvo token" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ Error en login ADMIN" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    $testsFailed++
}
Write-Host ""

# ============================================
# 3. LOGIN COMO VOCAL
# ============================================
Write-Host "[3/5]" -ForegroundColor Yellow -NoNewline
Write-Host " Intentando login como VOCAL..."
Write-Host "POST $ApiUrl/api/auth/login" -ForegroundColor Gray
Write-Host "Credenciales: vocal@keeper.ec / vocal123" -ForegroundColor Gray
Write-Host ""

try {
    $vocalLoginBody = @{
        email = "vocal@keeper.ec"
        password = "vocal123"
    } | ConvertTo-Json

    $vocalLoginResponse = Invoke-WebRequest -Uri "$ApiUrl/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $vocalLoginBody | Select-Object -ExpandProperty Content

    $vocalJson = $vocalLoginResponse | ConvertFrom-Json
    $vocalJson | ConvertTo-Json | Write-Host -ForegroundColor Gray

    $vocalToken = $vocalJson.token
    if ($vocalToken) {
        Write-Host "✅ Login VOCAL exitoso" -ForegroundColor Green
        Write-Host "Token: $($vocalToken.Substring(0, 50))..." -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "❌ No se obtuvo token" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ Error en login VOCAL" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    $testsFailed++
}
Write-Host ""

# ============================================
# 4. VERIFICAR ROLES
# ============================================
Write-Host "[4/5]" -ForegroundColor Yellow -NoNewline
Write-Host " Verificando roles en tokens..."
Write-Host ""

function DecodeJwt($token) {
    $parts = $token.Split('.')
    if ($parts.Length -ne 3) { return $null }

    $payload = $parts[1]
    # Agregar padding si es necesario
    $padding = 4 - ($payload.Length % 4)
    if ($padding -ne 4) {
        $payload += ("=" * $padding)
    }

    try {
        $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($payload))
        return $decoded | ConvertFrom-Json
    } catch {
        return $null
    }
}

if ($adminToken) {
    Write-Host "Decodificando token ADMIN:" -ForegroundColor Cyan
    $adminPayload = DecodeJwt $adminToken
    if ($adminPayload) {
        $adminPayload | ConvertTo-Json | Write-Host -ForegroundColor Gray
    }
    Write-Host ""
}

if ($vocalToken) {
    Write-Host "Decodificando token VOCAL:" -ForegroundColor Cyan
    $vocalPayload = DecodeJwt $vocalToken
    if ($vocalPayload) {
        $vocalPayload | ConvertTo-Json | Write-Host -ForegroundColor Gray
    }
    Write-Host ""
}

# ============================================
# 5. TEST DE LOGOUT
# ============================================
Write-Host "[5/5]" -ForegroundColor Yellow -NoNewline
Write-Host " Testeando LOGOUT..."
Write-Host "POST $ApiUrl/api/auth/logout" -ForegroundColor Gray
Write-Host ""

try {
    $logoutResponse = Invoke-WebRequest -Uri "$ApiUrl/api/auth/logout" `
        -Method POST `
        -ContentType "application/json" | Select-Object -ExpandProperty Content

    $logoutJson = $logoutResponse | ConvertFrom-Json
    $logoutJson | ConvertTo-Json | Write-Host -ForegroundColor Gray

    if ($logoutJson.ok) {
        Write-Host "✅ Logout exitoso" -ForegroundColor Green
        $testsPassed++
    } else {
        Write-Host "❌ Error en logout" -ForegroundColor Red
        $testsFailed++
    }
} catch {
    Write-Host "❌ Error en logout" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    $testsFailed++
}

Write-Host ""

# ============================================
# RESUMEN
# ============================================
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║                      📊 RESUMEN DE TESTS                     ║" -ForegroundColor Blue
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""
Write-Host "Total: " -NoNewline
Write-Host "✅ $testsPassed" -ForegroundColor Green -NoNewline
Write-Host " | " -NoNewline
Write-Host "❌ $testsFailed" -ForegroundColor Red
Write-Host ""

# ============================================
# PRÓXIMO PASO
# ============================================
Write-Host "📍 PRÓXIMO PASO:" -ForegroundColor Blue
Write-Host ""

if ($testsPassed -ge 3) {
    Write-Host "Si todos los tests pasaron ✅:" -ForegroundColor Green
    Write-Host "  1. Ve a: $ApiUrl/admin/login"
    Write-Host "  2. Email: admin@keeper.ec"
    Write-Host "  3. Password: admin123"
    Write-Host "  4. Deberías ver el dashboard"
} else {
    Write-Host "Si algo falló ❌:" -ForegroundColor Red
    Write-Host "  - Revisa los logs de error arriba"
    Write-Host "  - Verifica que la BD está conectada"
    Write-Host "  - Intenta: npm run build && npm run dev"
}

Write-Host ""
