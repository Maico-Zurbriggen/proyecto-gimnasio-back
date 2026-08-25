# Permisos y protección del repositorio

## Situación actual: repositorio personal

Los tres repositorios pertenecen inicialmente a la cuenta personal `Maico-Zurbriggen`. GitHub sólo ofrece dos niveles en este tipo de repositorio:

- propietario, con control completo;
- colaboradores, con lectura y escritura.

Por eso no es posible asignar `Triage`, `Write` o `Maintain` a integrantes distintos mientras siga bajo una cuenta personal. Las reglas de rama sí pueden impedir push directo y exigir revisiones. El archivo `.github/CODEOWNERS` exige la revisión de `@Maico-Zurbriggen` cuando se activa la opción correspondiente.

Para permisos granulares, crear una organización, transferir el repositorio y aplicar esta matriz:

| Responsabilidad                             | Rol de organización |
| ------------------------------------------- | ------------------- |
| 1–2 responsables de seguridad/configuración | Admin               |
| Tech Lead / DevOps                          | Maintain            |
| Integrantes que programan                   | Write               |
| QA / Producto sin necesidad de push         | Triage              |

## Ruleset de `main`

Crear un ruleset activo dirigido a la rama por defecto con estas reglas:

- requerir pull request antes de fusionar;
- requerir 1 aprobación;
- requerir que la aprobación sea del Code Owner;
- descartar aprobaciones cuando se agreguen commits;
- requerir aprobación del último push por otra persona;
- requerir resolución de todas las conversaciones;
- requerir el status check `quality` y que la rama esté actualizada;
- bloquear force-push y eliminación;
- no agregar actores a la lista de bypass;
- permitir únicamente squash merge;
- deshabilitar auto-merge en `Settings → General → Pull Requests`.

El propietario conserva la capacidad administrativa de editar o eliminar estas reglas. Ninguna configuración dentro de un repositorio personal puede quitarle ese control final.

## Ruleset de `develop`

- requerir PR y 1 aprobación;
- requerir que apruebe una persona distinta de quien hizo el último push;
- descartar aprobaciones obsoletas;
- requerir conversaciones resueltas y check `quality`;
- bloquear force-push y eliminación;
- sin restricción de actualización adicional para quienes tengan `Write`.

## Entornos

- `staging`: despliegue automático desde `release/*` después de CI.
- `production`: sólo desde `main`, con aprobación manual de al menos un responsable que no haya iniciado el despliegue.

## Verificación

Probar las reglas con una cuenta integrante, no administradora:

1. Intentar push directo a `main`: debe rechazarse.
2. Abrir un PR sin aprobación: no debe poder fusionarse.
3. Agregar un commit después de una aprobación: la aprobación debe descartarse.
4. En `main`, aprobar como Code Owner con CI verde: el botón de merge manual debe habilitarse.
5. Confirmar que no aparece la opción de auto-merge.
