export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  companyId?: string;
}

export interface AuthMembership {
  id: string;
  companyId: string;
  roleId: string;
  roleCode: string;
  permissions: string[];
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  cid?: string;
  typ: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  typ: 'refresh';
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      membership?: AuthMembership;
    }
  }
}
