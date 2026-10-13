import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app';
import type { InventoryRepository } from '../../src/modules/inventory/application/inventory';
import type {
  StudentContextRecord,
  StudentContextRepository,
} from '../../src/modules/student-context/application/student-context.use-cases';

const GYM = '10000000-0000-4000-8000-000000000001';
const admin = {
  'x-user-id': '21000000-0000-4000-8000-000000000001',
  'x-user-roles': 'ADMINISTRADOR',
  'x-gym-id': GYM,
};
const alumno = {
  'x-user-id': '21000000-0000-4000-8000-000000000010',
  'x-user-roles': 'ALUMNO',
  'x-gym-id': GYM,
};

const CATALOGO = [
  { movementPattern: 'EMPUJE_HORIZONTAL', equipment: ['PESO_CORPORAL'] },
  { movementPattern: 'DOMINANTE_RODILLA', equipment: [] },
  { movementPattern: 'TRACCION_VERTICAL', equipment: ['POLEA_ALTA'] },
  { movementPattern: 'DOMINANTE_CADERA', equipment: ['BARRA'] },
];

function inventoryApp(present: string[] = [], trainers = 0) {
  const inventoryRepository: InventoryRepository = {
    listEquipment: vi.fn(() =>
      Promise.resolve(
        ['PESO_CORPORAL', 'BARRA', 'POLEA_ALTA'].map((code) => ({
          code,
          name: code,
          present: present.includes(code),
        })),
      ),
    ),
    listCatalog: vi.fn(() => Promise.resolve(CATALOGO)),
    save: vi.fn(() => Promise.resolve({ markedIncompatible: 2, restored: 0 })),
    countActiveTrainers: vi.fn(() => Promise.resolve(trainers)),
    hasDeclaredInventory: vi.fn(() => Promise.resolve(present.length > 0)),
  };
  return { app: createApp({ inventoryRepository }), inventoryRepository };
}

describe('Inventario del gimnasio (FL-20, HU13 criterios 14 y 15)', () => {
  it('con inventario vacío sólo queda el peso corporal y advierte patrones', async () => {
    const { app } = inventoryApp();

    const response = await request(app)
      .get('/admin/inventory')
      .set(admin)
      .expect(200);

    expect(response.body.onlyBodyweight).toBe(true);
    expect(response.body.prescribableExercises).toBe(2);
    expect(response.body.missingPatterns).toEqual([
      'TRACCION',
      'DOMINANTE_CADERA',
    ]);
    const peso = response.body.equipment.find(
      (item: { code: string }) => item.code === 'PESO_CORPORAL',
    );
    expect(peso).toMatchObject({ present: true, alwaysPresent: true });
  });

  it('guarda el inventario sin el peso corporal e informa lo que cambió', async () => {
    const { app, inventoryRepository } = inventoryApp();

    const response = await request(app)
      .put('/admin/inventory')
      .set(admin)
      .send({ present: ['PESO_CORPORAL', 'BARRA'] })
      .expect(200);

    expect(inventoryRepository.save).toHaveBeenCalledWith({
      gymId: GYM,
      actorUserId: admin['x-user-id'],
      present: ['BARRA'],
    });
    expect(response.body.markedIncompatible).toBe(2);
  });

  it('rechaza equipamiento fuera de la enumeración', async () => {
    const { app } = inventoryApp();

    const response = await request(app)
      .put('/admin/inventory')
      .set(admin)
      .send({ present: ['NAVE_ESPACIAL'] })
      .expect(422);
    expect(response.body.error).toBe('unknown_equipment');
  });

  it('CB-59: informa los pasos que faltan para que alguien pueda entrenar', async () => {
    const vacio = await request(inventoryApp().app)
      .get('/admin/setup')
      .set(admin)
      .expect(200);
    expect(vacio.body).toEqual({
      hasTrainer: false,
      hasInventory: false,
      ready: false,
    });

    const listo = await request(inventoryApp(['BARRA'], 1).app)
      .get('/admin/setup')
      .set(admin)
      .expect(200);
    expect(listo.body.ready).toBe(true);
  });

  it('sólo el administrador gestiona el inventario', async () => {
    const { app } = inventoryApp();
    for (const role of ['ENTRENADOR', 'ALUMNO', 'SUPERADMIN']) {
      await request(app)
        .get('/admin/inventory')
        .set({ ...admin, 'x-user-roles': role })
        .expect(403);
    }
  });
});

describe('Consentimiento de datos de salud (RN-104, FL-19/A2)', () => {
  function contextApp(consent: boolean) {
    let record: StudentContextRecord = {
      experienceLevel: null,
      availableDaysPerWeek: null,
      birthDate: null,
      sex: null,
      heightCm: null,
      weightKg: null,
      trainer: null,
      healthDataConsent: consent,
    };
    const studentContextRepository: StudentContextRepository = {
      find: vi.fn(() => Promise.resolve(record)),
      save: vi.fn(() => Promise.resolve(record)),
      grantHealthConsent: vi.fn(() => {
        record = { ...record, healthDataConsent: true };
        return Promise.resolve(true);
      }),
    };
    return {
      app: createApp({ studentContextRepository }),
      studentContextRepository,
    };
  }

  const CONTEXTO = {
    experienceLevel: 'PRINCIPIANTE',
    availableDaysPerWeek: 3,
    birthDate: '1998-01-01',
    sex: 'FEMENINO',
    heightCm: 165,
    weightKg: 60,
  };

  it('sin consentimiento no se guardan peso ni altura', async () => {
    const { app, studentContextRepository } = contextApp(false);

    const response = await request(app)
      .put('/students/me/context')
      .set(alumno)
      .send(CONTEXTO)
      .expect(409);

    expect(response.body.error).toBe('health_data_consent_required');
    expect(studentContextRepository.save).not.toHaveBeenCalled();
  });

  it('se puede otorgar después del alta y entonces se guarda', async () => {
    const { app, studentContextRepository } = contextApp(false);

    const otorgado = await request(app)
      .post('/students/me/health-consent')
      .set(alumno)
      .expect(201);
    expect(otorgado.body.healthDataConsent).toBe(true);
    expect(otorgado.body.healthConsentText).toContain('datos de salud');

    await request(app)
      .put('/students/me/context')
      .set(alumno)
      .send(CONTEXTO)
      .expect(200);
    expect(studentContextRepository.save).toHaveBeenCalled();
  });
});
