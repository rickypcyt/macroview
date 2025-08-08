# Sistema de Caché de Noticias

## Descripción General

El sistema de caché de noticias está diseñado para evitar múltiples requests innecesarios a la API de NewsAPI y proteger contra el agotamiento de la cuota diaria. El sistema implementa un caché persistente que almacena las noticias por 24 horas y limita las consultas a la API.

## Características Principales

### 🚀 Caché Persistente
- **Duración**: 24 horas por categoría de noticias
- **Almacenamiento**: localStorage del navegador
- **Persistencia**: Los datos se mantienen entre sesiones

### 📊 Control de Rate Limiting
- **Límite diario**: 50 requests por usuario por día
- **Reset automático**: El contador se reinicia cada día a las 00:00
- **Prevención de duplicados**: Evita múltiples requests simultáneos

### 🔄 Gestión Inteligente
- **Cache-first**: Siempre verifica el caché antes de hacer requests
- **Fallback**: Usa datos expirados si la API no está disponible
- **Sincronización**: Evita requests duplicados con un sistema de promesas

## Arquitectura del Sistema

### Archivos Principales

1. **`src/app/utils/newsService.ts`**
   - Servicio principal de noticias
   - Manejo de caché y requests a la API
   - Control de rate limiting

2. **`src/app/utils/useNewsCache.ts`**
   - Hook personalizado para React
   - Estado del caché y estadísticas
   - Funciones de gestión

3. **`src/app/components/NewsSection.tsx`**
   - Componente de visualización de noticias
   - Integración con el servicio de caché

4. **`src/app/components/NewsCacheManager.tsx`**
   - Interfaz de gestión del caché
   - Estadísticas en tiempo real
   - Opciones de limpieza manual

### Flujo de Datos

```
Usuario accede a noticias
         ↓
Verificar caché local
         ↓
¿Datos válidos en caché?
    ↓ Sí        ↓ No
Mostrar datos   Verificar límite diario
         ↓
¿Puede hacer request?
    ↓ Sí        ↓ No
Hacer request   Mostrar error
         ↓
Guardar en caché
         ↓
Mostrar datos
```

## Configuración

### Variables de Entorno

```env
NEXT_PUBLIC_NEWS_API_KEY=tu_api_key_aqui
```

### Configuración del Caché

```typescript
// Duración del caché (24 horas)
const CACHE_DURATION = 24 * 60 * 60 * 1000;

// Máximo requests por día
const MAX_DAILY_REQUESTS = 50;
```

## Uso del Sistema

### Obtener Noticias

```typescript
import { getNewsForCategory } from '../utils/newsService';

const result = await getNewsForCategory('tariffs trade import export');
console.log(result.data); // Array de noticias
console.log(result.fromCache); // true/false
console.log(result.error); // string o undefined
```

### Estadísticas del Caché

```typescript
import { getCacheStats } from '../utils/newsService';

const stats = getCacheStats();
console.log(stats.dailyRequestCount); // Requests hoy
console.log(stats.totalCachedCategories); // Categorías en caché
console.log(stats.lastFetchDate); // Última actualización
```

### Hook de React

```typescript
import { useNewsCache } from '../utils/useNewsCache';

function MyComponent() {
  const {
    stats,
    isClearing,
    clearCache,
    getUsagePercentage,
    remainingRequests
  } = useNewsCache();

  return (
    <div>
      <p>Requests hoy: {stats.dailyRequestCount}/50</p>
      <p>Restantes: {remainingRequests}</p>
      <button onClick={clearCache}>Limpiar Caché</button>
    </div>
  );
}
```

## Beneficios

### 🎯 Para el Usuario
- **Carga rápida**: Las noticias se cargan instantáneamente desde el caché
- **Experiencia consistente**: No hay interrupciones por rate limiting
- **Transparencia**: Puede ver el estado del caché y los requests restantes

### 🛡️ Para la API
- **Protección de cuota**: Máximo 50 requests por usuario por día
- **Requests eficientes**: Solo se hacen requests cuando es necesario
- **Respeto a límites**: Sistema de delays entre requests

### 💾 Para el Sistema
- **Rendimiento**: Reducción significativa de requests a la API
- **Escalabilidad**: Sistema que maneja múltiples usuarios sin problemas
- **Mantenibilidad**: Código modular y bien documentado

## Monitoreo y Debugging

### Logs del Sistema

El sistema registra automáticamente:
- Requests exitosos a la API
- Errores de rate limiting
- Fallbacks a caché expirado
- Limpieza de caché

### Métricas Disponibles

- Requests diarios por usuario
- Categorías en caché
- Última actualización
- Porcentaje de uso de la cuota

## Troubleshooting

### Problemas Comunes

1. **"Daily request limit exceeded"**
   - Solución: Esperar hasta el día siguiente o limpiar caché manualmente

2. **"Rate limit exceeded"**
   - Solución: El sistema automáticamente usa caché expirado

3. **"NewsAPI key not configured"**
   - Solución: Configurar NEXT_PUBLIC_NEWS_API_KEY en .env.local

### Limpieza Manual

```typescript
import { clearNewsCache } from '../utils/newsService';

// Limpiar todo el caché
clearNewsCache();
```

## Futuras Mejoras

- [ ] Caché compartido entre usuarios (backend)
- [ ] Compresión de datos en localStorage
- [ ] Notificaciones push para nuevas noticias
- [ ] Filtros personalizados por usuario
- [ ] Métricas avanzadas de uso
