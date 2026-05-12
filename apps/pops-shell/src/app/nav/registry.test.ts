// CI guardrail against silent nav drift: missing icon mappings would otherwise
// render a fallback letter instead of failing the build.
import { describe, expect, it } from 'vitest';

import { iconMap } from './icon-map';
import { registeredApps } from './registry';

describe('nav registry', () => {
  it('registers at least one app', () => {
    expect(registeredApps.length).toBeGreaterThan(0);
  });

  it.each(registeredApps.map((app) => [app.id, app] as const))(
    '%s app icon resolves through iconMap',
    (_, app) => {
      expect(iconMap[app.icon]).toBeDefined();
    }
  );

  it.each(
    registeredApps.flatMap((app) =>
      app.items.map((item) => [`${app.id}${item.path || '/'}`, item.icon] as const)
    )
  )('%s item icon resolves through iconMap', (_, icon) => {
    expect(iconMap[icon]).toBeDefined();
  });

  it('has unique app ids', () => {
    const ids = registeredApps.map((app) => app.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique basePaths', () => {
    const basePaths = registeredApps.map((app) => app.basePath);
    expect(new Set(basePaths).size).toBe(basePaths.length);
  });

  it.each(registeredApps.map((app) => [app.id, app.basePath] as const))(
    '%s basePath is rooted (starts with "/")',
    (_, basePath) => {
      expect(basePath.startsWith('/')).toBe(true);
    }
  );

  it.each(registeredApps.map((app) => [app.id, app] as const))(
    '%s items use rooted paths or the empty string',
    (_, app) => {
      for (const item of app.items) {
        expect(item.path === '' || item.path.startsWith('/')).toBe(true);
      }
    }
  );

  it.each(registeredApps.map((app) => [app.id, app] as const))(
    '%s items have unique paths',
    (_, app) => {
      const paths = app.items.map((item) => item.path);
      expect(new Set(paths).size).toBe(paths.length);
    }
  );
});
