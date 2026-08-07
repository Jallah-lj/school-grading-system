/**
 * OpenAPI docs route — serves:
 *   GET /api/docs            → Swagger UI (interactive HTML page, CDN-based)
 *   GET /api/docs/openapi.json → raw OpenAPI 3.0.3 spec
 *
 * No extra npm packages required — the Swagger UI is loaded from the official
 * unpkg CDN, which keeps the server bundle lean.
 */
import { Router } from 'express';

import { buildOpenApiSpec } from '../openapi/spec';

export const docsRouter = Router();

// Cache the spec once — it never changes at runtime.
let cachedSpec: ReturnType<typeof buildOpenApiSpec> | null = null;
function getSpec() {
  if (!cachedSpec) cachedSpec = buildOpenApiSpec();
  return cachedSpec;
}

// ── Raw OpenAPI JSON ───────────────────────────────────────────────────────────
docsRouter.get('/openapi.json', (_req, res) => {
  res.type('application/json').json(getSpec());
});

// ── Swagger UI ─────────────────────────────────────────────────────────────────
docsRouter.get('/', (_req, res) => {
  res.type('html').send(swaggerHtml);
});

const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>School Grading System — API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    body { margin: 0; padding: 0; }
    /* Make the top bar match the school brand */
    .topbar-wrapper img[alt="Swagger UI"] { display: none; }
    .topbar-wrapper .link::after {
      content: 'School Grading System API';
      font-size: 18px;
      font-weight: 600;
      color: #fff;
    }
    .swagger-ui .info .title { color: #1e3a5f; }
    .swagger-ui .info .description p { max-width: 80ch; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function () {
      SwaggerUIBundle({
        url: './openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
        defaultModelsExpandDepth: 1,
        defaultModelExpandDepth: 1,
        docExpansion: 'list',
        filter: true,
        tryItOutEnabled: false,
        syntaxHighlight: { activated: true, theme: 'monokai' },
      });
    };
  </script>
</body>
</html>`;
