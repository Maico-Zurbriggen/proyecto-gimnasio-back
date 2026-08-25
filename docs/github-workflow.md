# Flujo de trabajo en GitHub

## Ramas

- `main`: producción. Siempre estable, protegida y etiquetada por versión.
- `develop`: integración del próximo incremento. Todas las features parten de aquí.
- `feature/<issue>-<descripcion>`: trabajo funcional corto.
- `fix/<issue>-<descripcion>`: correcciones sobre `develop`.
- `release/<version>`: estabilización y despliegue al entorno de prueba.
- `hotfix/<issue>-<descripcion>`: corrección urgente creada desde `main`.

No se mantiene una rama permanente `test`. El entorno de prueba se despliega desde `release/*`; así el código candidato queda congelado sin sumar una tercera rama larga que deba sincronizarse continuamente.

## Flujo normal

```text
feature/* -> PR -> develop -> release/* -> PR -> main
                              |              |
                           staging        producción
```

1. Crear o asignar un issue con criterios de aceptación.
2. Crear la rama desde `develop`.
3. Abrir un draft PR temprano y mantenerlo acotado.
4. Requerir CI verde y la revisión de una persona distinta de quien hizo el último push.
5. Hacer squash merge a `develop` y borrar la rama.
6. En un hito, crear `release/<version>` y desplegarla al entorno de prueba.
7. Durante QA sólo entran correcciones de estabilización en la release.
8. Fusionar la release a `main`, crear tag y volver a integrar cualquier corrección en `develop`.

Un `hotfix/*` sale de `main`, vuelve a `main` por PR y luego se integra también en `develop`.

## Protección recomendada

Para `main` y `develop`:

- prohibir push directo y force-push;
- exigir PR y una aprobación;
- invalidar aprobaciones cuando haya nuevos commits;
- exigir resolución de conversaciones;
- exigir el check `quality` de GitHub Actions;
- exigir rama actualizada antes del merge;
- permitir squash merge y borrar ramas automáticamente.

Para `main`, agregar un environment `production` con aprobación manual. Para `release/*`, desplegar a un environment `staging`.

### Reglas adicionales de `main`

- exigir una aprobación y que sea del `CODEOWNERS` definido;
- exigir aprobación de una persona distinta de quien realizó el último push;
- impedir que administradores y roles con bypass omitan las reglas;
- deshabilitar auto-merge en la configuración general del repositorio;
- exigir el environment `production` con aprobación manual antes del despliegue.

La aprobación de un PR habilita el merge, pero no lo ejecuta automáticamente. La persona responsable de la release verifica CI, aprobación y versión antes de realizarlo manualmente.

## Commits y versiones

Usar Conventional Commits en inglés, por ejemplo:

```text
feat(training): persist completed sets
fix(auth): enforce student ownership
docs(repo): define branching workflow
```

Las releases usan SemVer y tags `vX.Y.Z`. Mientras el producto no sea estable se comienza en `v0.x.y`.
