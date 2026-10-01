#!/bin/bash

# Script para testear sistema de usuarios
# USO: bash scripts/test-users.sh [http://localhost:3000 | https://keeper.com.ec]

API_URL="${1:-http://localhost:3000}"
RESET='\033[0m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'

echo -e "${BLUE}"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║     🧪 TESTING - Sistema de Usuarios Keeper Cup 3          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo -e "${RESET}"
echo "API URL: $API_URL"
echo ""

# ============================================
# 1. CREAR USUARIOS DE PRUEBA
# ============================================
echo -e "${YELLOW}[1/5]${RESET} Creando usuarios de prueba..."
echo "POST $API_URL/api/setup/init-admin"
echo ""

SETUP_RESPONSE=$(curl -s -X POST "$API_URL/api/setup/init-admin" \
  -H "Content-Type: application/json")

echo "$SETUP_RESPONSE" | jq '.' 2>/dev/null || echo "$SETUP_RESPONSE"
echo ""

# Verificar si creó usuarios
if echo "$SETUP_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ Usuarios creados exitosamente${RESET}"
else
  echo -e "${RED}❌ Error creando usuarios${RESET}"
  echo "Nota: Si ya existen usuarios, eso es normal"
fi
echo ""

# ============================================
# 2. LOGIN COMO ADMIN
# ============================================
echo -e "${YELLOW}[2/5]${RESET} Intentando login como ADMIN..."
echo "POST $API_URL/api/auth/login"
echo "Credenciales: admin@keeper.ec / admin123"
echo ""

ADMIN_LOGIN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@keeper.ec",
    "password": "admin123"
  }')

echo "$ADMIN_LOGIN" | jq '.' 2>/dev/null || echo "$ADMIN_LOGIN"
echo ""

# Extraer token admin
ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | jq -r '.token' 2>/dev/null)

if [ "$ADMIN_TOKEN" != "null" ] && [ -n "$ADMIN_TOKEN" ]; then
  echo -e "${GREEN}✅ Login ADMIN exitoso${RESET}"
  echo "Token: ${ADMIN_TOKEN:0:50}..."
else
  echo -e "${RED}❌ Error en login ADMIN${RESET}"
fi
echo ""

# ============================================
# 3. LOGIN COMO VOCAL
# ============================================
echo -e "${YELLOW}[3/5]${RESET} Intentando login como VOCAL..."
echo "POST $API_URL/api/auth/login"
echo "Credenciales: vocal@keeper.ec / vocal123"
echo ""

VOCAL_LOGIN=$(curl -s -X POST "$API_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "vocal@keeper.ec",
    "password": "vocal123"
  }')

echo "$VOCAL_LOGIN" | jq '.' 2>/dev/null || echo "$VOCAL_LOGIN"
echo ""

# Extraer token vocal
VOCAL_TOKEN=$(echo "$VOCAL_LOGIN" | jq -r '.token' 2>/dev/null)

if [ "$VOCAL_TOKEN" != "null" ] && [ -n "$VOCAL_TOKEN" ]; then
  echo -e "${GREEN}✅ Login VOCAL exitoso${RESET}"
  echo "Token: ${VOCAL_TOKEN:0:50}..."
else
  echo -e "${RED}❌ Error en login VOCAL${RESET}"
fi
echo ""

# ============================================
# 4. VERIFICAR PERMISOS
# ============================================
echo -e "${YELLOW}[4/5]${RESET} Verificando roles en tokens..."
echo ""

if [ -n "$ADMIN_TOKEN" ]; then
  echo "Decodificando token ADMIN:"
  echo "$ADMIN_TOKEN" | jq -R 'split(".") | .[1] | @base64d | fromjson' 2>/dev/null | jq '.' || echo "No se pudo decodificar"
  echo ""
fi

if [ -n "$VOCAL_TOKEN" ]; then
  echo "Decodificando token VOCAL:"
  echo "$VOCAL_TOKEN" | jq -R 'split(".") | .[1] | @base64d | fromjson' 2>/dev/null | jq '.' || echo "No se pudo decodificar"
  echo ""
fi

# ============================================
# 5. TEST DE LOGOUT
# ============================================
echo -e "${YELLOW}[5/5]${RESET} Testeando LOGOUT..."
echo "POST $API_URL/api/auth/logout"
echo ""

LOGOUT_RESPONSE=$(curl -s -X POST "$API_URL/api/auth/logout" \
  -H "Content-Type: application/json")

echo "$LOGOUT_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGOUT_RESPONSE"
echo ""

if echo "$LOGOUT_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅ Logout exitoso${RESET}"
else
  echo -e "${RED}❌ Error en logout${RESET}"
fi

# ============================================
# RESUMEN
# ============================================
echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗"
echo "║                      📊 RESUMEN DE TESTS                     ║"
echo "╚════════════════════════════════════════════════════════════╝${RESET}"
echo ""

TESTS_PASSED=0
TESTS_FAILED=0

# Test 1: Setup
if echo "$SETUP_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅${RESET} Setup usuarios"
  ((TESTS_PASSED++))
elif echo "$SETUP_RESPONSE" | grep -q "usuarios en la BD"; then
  echo -e "${YELLOW}⚠️${RESET}  Setup (usuarios ya existen)"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌${RESET} Setup usuarios"
  ((TESTS_FAILED++))
fi

# Test 2: Admin login
if [ "$ADMIN_TOKEN" != "null" ] && [ -n "$ADMIN_TOKEN" ]; then
  echo -e "${GREEN}✅${RESET} Login ADMIN"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌${RESET} Login ADMIN"
  ((TESTS_FAILED++))
fi

# Test 3: Vocal login
if [ "$VOCAL_TOKEN" != "null" ] && [ -n "$VOCAL_TOKEN" ]; then
  echo -e "${GREEN}✅${RESET} Login VOCAL"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌${RESET} Login VOCAL"
  ((TESTS_FAILED++))
fi

# Test 4: Logout
if echo "$LOGOUT_RESPONSE" | grep -q '"ok":true'; then
  echo -e "${GREEN}✅${RESET} Logout"
  ((TESTS_PASSED++))
else
  echo -e "${RED}❌${RESET} Logout"
  ((TESTS_FAILED++))
fi

echo ""
echo "Total: ${GREEN}${TESTS_PASSED} ✅${RESET} | ${RED}${TESTS_FAILED} ❌${RESET}"
echo ""

# ============================================
# SIGUIENTE PASO
# ============================================
echo -e "${BLUE}📍 PRÓXIMO PASO:${RESET}"
echo ""
echo "Si todos los tests pasaron ✅:"
echo "  1. Ve a: $API_URL/admin/login"
echo "  2. Email: admin@keeper.ec"
echo "  3. Password: admin123"
echo "  4. Deberías ver el dashboard"
echo ""
echo "Si algo falló ❌:"
echo "  - Revisa los logs de error arriba"
echo "  - Verifica que la BD está conectada"
echo "  - Intenta: npm run build && npm run dev"
echo ""
