import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/setup-app.js';

interface Session {
  accessToken: string;
  refreshToken: string;
}

interface RegisterResponse {
  tokens: Session;
  company: { id: string; name: string };
  user: { id: string; email: string };
  permissions: string[];
}

const PREFIX = '/api/v1';
const PASSWORD = 'Passw0rd1';

describe('ContaBeni API (e2e)', () => {
  let app: INestApplication;
  const stamp = Date.now();
  const emailA = `e2e-a-${stamp}@contabeni.bo`;
  const emailB = `e2e-b-${stamp}@contabeni.bo`;
  let sessionA: Session;
  let companyAId: string;
  let sessionB: Session;
  let adminRoleId: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app, { swagger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('GET /health responde ok', async () => {
    const res = await http().get(`${PREFIX}/health`).expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('up');
  });

  it('POST /auth/register crea usuario, empresa y membresía admin', async () => {
    const res = await http()
      .post(`${PREFIX}/auth/register`)
      .send({
        email: emailA,
        password: PASSWORD,
        firstName: 'Ana',
        lastName: 'Aguilar',
        companyName: `Empresa A ${stamp}`,
        nit: `9${stamp}`,
      })
      .expect(201);

    const body = res.body as RegisterResponse;
    expect(body.company.id).toBeDefined();
    expect(body.permissions).toContain('company.update');
    expect(body.tokens.accessToken).toBeDefined();
    expect(body.tokens.refreshToken).toBeDefined();
    sessionA = body.tokens;
    companyAId = body.company.id;
  });

  it('rechaza contraseñas débiles', async () => {
    await http()
      .post(`${PREFIX}/auth/register`)
      .send({
        email: `weak-${stamp}@contabeni.bo`,
        password: '123',
        firstName: 'Debil',
        lastName: 'Prueba',
        companyName: 'No Creada',
      })
      .expect(400);
  });

  it('POST /auth/login devuelve sesión y permisos', async () => {
    const res = await http()
      .post(`${PREFIX}/auth/login`)
      .send({ email: emailA, password: PASSWORD })
      .expect(201);

    const body = res.body as RegisterResponse;
    expect(body.user.email).toBe(emailA);
    expect(body.permissions).toContain('sales.invoice.create');
    sessionA = body.tokens;
  });

  it('GET /auth/me devuelve perfil, empresa y membresías', async () => {
    const res = await http()
      .get(`${PREFIX}/auth/me`)
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .expect(200);

    expect(res.body.user.email).toBe(emailA);
    expect(res.body.company.id).toBe(companyAId);
    expect(res.body.role.code).toBe('ADMIN');
    expect(res.body.memberships).toHaveLength(1);
  });

  it('GET /roles lista los roles del sistema con permisos', async () => {
    const res = await http()
      .get(`${PREFIX}/roles`)
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .set('x-company-id', companyAId)
      .expect(200);

    const codes = res.body.map((r: { code: string }) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining(['ADMIN', 'CONTADOR', 'VENDEDOR', 'CAJERO']),
    );
    adminRoleId = res.body.find((r: { code: string }) => r.code === 'ADMIN').id;
  });

  it('GET /companies lista las empresas del usuario', async () => {
    const res = await http()
      .get(`${PREFIX}/companies`)
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].companyId).toBe(companyAId);
    expect(res.body[0].roleCode).toBe('ADMIN');
  });

  it('POST /companies crea una segunda empresa con membresía', async () => {
    const res = await http()
      .post(`${PREFIX}/companies`)
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .send({ name: `Empresa B ${stamp}`, nit: `8${stamp}` })
      .expect(201);

    expect(res.body.id).toBeDefined();

    const list = await http()
      .get(`${PREFIX}/companies`)
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .expect(200);
    expect(list.body).toHaveLength(2);
  });

  it('POST /companies/:id/members agrega un miembro existente o nuevo', async () => {
    const res = await http()
      .post(`${PREFIX}/companies/${companyAId}/members`)
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .set('x-company-id', companyAId)
      .send({
        email: emailB,
        firstName: 'Beto',
        lastName: 'Barba',
        password: PASSWORD,
        roleId: adminRoleId,
      })
      .expect(201);

    expect(res.body.email).toBe(emailB);

    const members = await http()
      .get(`${PREFIX}/companies/${companyAId}/members`)
      .set('Authorization', `Bearer ${sessionA.accessToken}`)
      .set('x-company-id', companyAId)
      .expect(200);
    expect(members.body.meta.total).toBe(2);
  });

  it('bloquea el acceso a empresas ajenas (aislamiento de tenant)', async () => {
    const loginB = await http()
      .post(`${PREFIX}/auth/login`)
      .send({ email: emailB, password: PASSWORD })
      .expect(201);
    sessionB = loginB.body.tokens as Session;

    // B es miembro de A: sí puede consultarla con el header de empresa.
    await http()
      .get(`${PREFIX}/companies/${companyAId}/members`)
      .set('Authorization', `Bearer ${sessionB.accessToken}`)
      .set('x-company-id', companyAId)
      .expect(200);

    // Un usuario totalmente ajeno no puede hacerlo.
    const alienEmail = `e2e-alien-${stamp}@contabeni.bo`;
    await http()
      .post(`${PREFIX}/auth/register`)
      .send({
        email: alienEmail,
        password: PASSWORD,
        firstName: 'Alien',
        lastName: 'Extraterrestre',
        companyName: `Empresa Alien ${stamp}`,
      })
      .expect(201);

    const alienLogin = await http()
      .post(`${PREFIX}/auth/login`)
      .send({ email: alienEmail, password: PASSWORD })
      .expect(201);

    await http()
      .get(`${PREFIX}/roles`)
      .set('Authorization', `Bearer ${alienLogin.body.tokens.accessToken}`)
      .set('x-company-id', companyAId)
      .expect(403);

    await http()
      .get(`${PREFIX}/companies/${companyAId}/members`)
      .set('Authorization', `Bearer ${alienLogin.body.tokens.accessToken}`)
      .set('x-company-id', companyAId)
      .expect(403);
  });

  it('POST /auth/refresh rota el token y el anterior queda revocado', async () => {
    const first = await http()
      .post(`${PREFIX}/auth/refresh`)
      .send({ refreshToken: sessionA.refreshToken })
      .expect(201);

    expect(first.body.tokens.refreshToken).toBeDefined();
    expect(first.body.tokens.refreshToken).not.toBe(sessionA.refreshToken);

    // Reutilizar el refresh token anterior debe fallar (rotación).
    await http()
      .post(`${PREFIX}/auth/refresh`)
      .send({ refreshToken: sessionA.refreshToken })
      .expect(401);

    sessionA = first.body.tokens as Session;
  });

  it('rechaza peticiones sin token en rutas protegidas', async () => {
    await http().get(`${PREFIX}/companies`).expect(401);
  });

  it('POST /auth/logout revoca el refresh token', async () => {
    await http()
      .post(`${PREFIX}/auth/logout`)
      .send({ refreshToken: sessionA.refreshToken })
      .expect(201);

    await http()
      .post(`${PREFIX}/auth/refresh`)
      .send({ refreshToken: sessionA.refreshToken })
      .expect(401);
  });
});
