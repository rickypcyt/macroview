# 🌍 MacroView - Global Economic Data Visualization

Una aplicación web interactiva para visualizar datos económicos globales, incluyendo PIB, inflación, aranceles y noticias financieras en tiempo real.

## ✨ Características Principales

### 📊 Visualización de Datos
- **Mapa interactivo mundial** con datos económicos por país
- **Estadísticas globales** de PIB, inflación y aranceles
- **Gráficos dinámicos** y comparativas entre países
- **Búsqueda avanzada** de países con autocompletado

### 📰 Sistema de Noticias Inteligente
- **Caché persistente** que evita múltiples requests a la API
- **Límite de 50 requests por día** por usuario para proteger la cuota
- **Actualización automática** cada 24 horas
- **Categorías organizadas**: Aranceles, Economía Mundial, Tasas de Inflación

### 🚀 Rendimiento Optimizado
- **Caché local** para todos los datos económicos
- **Lazy loading** de datos por país
- **Gestión inteligente de errores** y fallbacks
- **Interfaz responsive** para todos los dispositivos

## 🛠️ Tecnologías Utilizadas

- **Frontend**: Next.js 14, React 18, TypeScript
- **Estilos**: Tailwind CSS, CSS Modules
- **Mapas**: GeoJSON, D3.js
- **APIs**: World Bank, IMF, NewsAPI
- **Caché**: localStorage, sistema de caché personalizado

## 🚀 Instalación y Configuración

### Prerrequisitos
- Node.js 18+ 
- npm, yarn, pnpm o bun

### Instalación

1. **Clonar el repositorio**
```bash
git clone https://github.com/tu-usuario/macroview.git
cd macroview
```

2. **Instalar dependencias**
```bash
npm install
# o
yarn install
# o
bun install
```

3. **Configurar variables de entorno**
```bash
cp .env.example .env.local
```

Editar `.env.local` y agregar:
```env
# API Keys (opcionales para desarrollo)
NEXT_PUBLIC_NEWS_API_KEY=tu_news_api_key_aqui
NEXT_PUBLIC_API_NINJAS_KEY=tu_api_ninjas_key_aqui
```

4. **Ejecutar en desarrollo**
```bash
npm run dev
# o
yarn dev
# o
bun dev
```

5. **Abrir en el navegador**
```
http://localhost:3000
```

## 📰 Sistema de Caché de Noticias

### Características del Sistema
- **Caché persistente**: 24 horas por categoría
- **Control de rate limiting**: Máximo 50 requests por día
- **Gestión inteligente**: Evita requests duplicados
- **Fallback automático**: Usa datos expirados si la API no está disponible

### Gestión del Caché
- **Panel de control** integrado en la aplicación
- **Estadísticas en tiempo real** de uso de la API
- **Limpieza manual** del caché cuando sea necesario
- **Monitoreo automático** del estado del sistema

### Documentación Detallada
Ver [docs/NEWS_CACHE_SYSTEM.md](docs/NEWS_CACHE_SYSTEM.md) para información completa sobre el sistema de caché.

## 🧪 Pruebas

### Ejecutar pruebas del sistema de caché
```bash
node scripts/test-news-cache.js
```

### Pruebas de desarrollo
```bash
npm run test
# o
yarn test
```

## 📁 Estructura del Proyecto

```
macroview/
├── src/
│   ├── app/
│   │   ├── components/          # Componentes React
│   │   │   ├── NewsSection.tsx  # Sección de noticias
│   │   │   ├── NewsCacheManager.tsx # Gestor de caché
│   │   │   └── ...
│   │   ├── utils/
│   │   │   ├── newsService.ts   # Servicio de noticias
│   │   │   ├── useNewsCache.ts  # Hook de caché
│   │   │   └── ...
│   │   └── ...
│   └── ...
├── scripts/
│   └── test-news-cache.js       # Script de pruebas
├── docs/
│   └── NEWS_CACHE_SYSTEM.md     # Documentación del caché
└── ...
```

## 🔧 Configuración Avanzada

### Personalizar límites de caché
Editar `src/app/utils/newsService.ts`:
```typescript
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
const MAX_DAILY_REQUESTS = 50; // Máximo requests por día
```

### Agregar nuevas categorías de noticias
Editar `src/app/components/NewsSection.tsx`:
```typescript
const categories = [
  { name: "Nueva Categoría", query: "tu query aqui", icon: "🔍" },
  // ... otras categorías
];
```

## 🌐 APIs Utilizadas

### World Bank API
- **PIB por país** (NY.GDP.MKTP.CD)
- **Inflación** (FP.CPI.TOTL.ZG)
- **Datos demográficos**

### NewsAPI
- **Noticias financieras** en tiempo real
- **Categorización automática**
- **Rate limiting** controlado

### API Ninjas
- **Datos de población** por país
- **Información demográfica** adicional

## 🤝 Contribuir

1. Fork el proyecto
2. Crear una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abrir un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 🆘 Soporte

Si encuentras algún problema o tienes preguntas:

1. Revisar la [documentación del sistema de caché](docs/NEWS_CACHE_SYSTEM.md)
2. Ejecutar las [pruebas del sistema](scripts/test-news-cache.js)
3. Abrir un [issue](https://github.com/tu-usuario/macroview/issues)

## 🚀 Despliegue

### Vercel (Recomendado)
```bash
npm run build
vercel --prod
```

### Otros proveedores
El proyecto es compatible con cualquier proveedor que soporte Next.js:
- Netlify
- Railway
- DigitalOcean App Platform
- AWS Amplify

---

**Desarrollado con ❤️ para la visualización de datos económicos globales**
