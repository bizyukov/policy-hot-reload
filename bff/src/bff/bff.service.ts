import {
  ForbiddenException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Client, ClientGrpc, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { firstValueFrom, Observable } from 'rxjs';
import * as jwt from 'jsonwebtoken';

interface PdpClient {
  CheckAccess(data: Record<string, unknown>): Observable<{ allowed: boolean; reason: string; policyVersion: number }>;
}

interface JwtClaims {
  sub: string;
  username: string;
  role: string;
  department: string;
}

interface Document {
  id: number;
  title: string;
  department: string;
}

const ACCOUNTS: { username: string; password: string; role: string; department: string; fullName: string }[] = [
  { username: 'admin', password: 'admin', role: 'admin', department: 'it', fullName: 'Администратор' },
  { username: 'viewer', password: 'viewer', role: 'viewer', department: 'sales', fullName: 'Виктор Просмотров' },
  { username: 'manager', password: 'manager', role: 'manager', department: 'it', fullName: 'Менеджер Анна' },
];

@Injectable()
export class BffService implements OnModuleInit {
  @Client({
    transport: Transport.GRPC,
    options: {
      package: 'pdp',
      protoPath: join(__dirname, '../proto/pdp.proto'),
      url: process.env.PDP_SERVICE_URL || 'localhost:50050',
    },
  })
  private readonly pdpClient: ClientGrpc;

  private pdp: PdpClient;

  private readonly documents: Document[] = [
    { id: 1, title: 'Бюджет Q1', department: 'finance' },
    { id: 3, title: 'Бюджет Q3', department: 'finance' },
    { id: 4, title: 'План продаж', department: 'sales' },
    { id: 6, title: 'Склад IT', department: 'it' },
    { id: 7, title: 'Контракт с заказчиком', department: 'sales' },
  ];

  onModuleInit() {
    this.pdp = this.pdpClient.getService<PdpClient>('PDPService');
  }

  async login(username: string, password: string) {
    const account = ACCOUNTS.find((a) => a.username === username && a.password === password);
    if (!account) throw new UnauthorizedException('Неверный логин или пароль');
    const claims = {
      sub: account.username,
      username: account.username,
      fullName: account.fullName,
      role: account.role,
      department: account.department,
    };
    const token = jwt.sign(claims, process.env.JWT_SECRET || 'super-secret-key', { expiresIn: '1h' });
    return { token, role: account.role, department: account.department };
  }

  private verifyToken(authHeader?: string): JwtClaims {
    if (!authHeader) throw new UnauthorizedException('Требуется Authorization header');
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Требуется Bearer-токен');
    try {
      return jwt.verify(token, process.env.JWT_SECRET || 'super-secret-key') as JwtClaims;
    } catch {
      throw new UnauthorizedException('Невалидный токен');
    }
  }

  async getDocument(id: number, authHeader?: string) {
    const claims = this.verifyToken(authHeader);
    const doc = this.documents.find((d) => d.id === id);
    if (!doc) throw new ForbiddenException('Документ не найден');
    const decision = await firstValueFrom(
      this.pdp.CheckAccess({
        subjectId: claims.sub,
        role: claims.role,
        department: claims.department,
        action: 'document:read',
        resourceType: 'documents',
        resourceOwnerDepartment: doc.department,
      }),
    );
    if (!decision.allowed) {
      throw new ForbiddenException(`Отказано (v${decision.policyVersion}): ${decision.reason}`);
    }
    return {
      document: doc,
      policyVersion: decision.policyVersion,
      reason: decision.reason,
    };
  }

  private async proxyPdp(path: string, method: 'GET' | 'POST', body?: unknown) {
    const pdpRest = process.env.PDP_HTTP_URL || 'http://localhost:3001';
    const res = await fetch(`${pdpRest}${path}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`pdp вернул ${res.status}`);
    return res.json();
  }

  getPolicies() {
    return this.proxyPdp('/policies', 'GET');
  }

  createVersion(description?: string, rule?: Record<string, unknown>) {
    return this.proxyPdp('/policies/versions', 'POST', { description, rule });
  }

  activateVersion(versionId: number) {
    return this.proxyPdp('/policies/activate', 'POST', { versionId });
  }

  rollback() {
    return this.proxyPdp('/policies/rollback', 'POST');
  }
}